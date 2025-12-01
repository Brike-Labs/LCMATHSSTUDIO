export default {
  /**
   * Cloudflare Worker entry point.
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, env: "worker", time: new Date().toISOString() });
    }

    if (!url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    return handleApi(request, env, ctx, url);
  },
};

/**
 * Basic API router stub.
 * @param {Request} request
 * @param {Env} env
 * @param {ExecutionContext} ctx
 * @param {URL} url
 */
async function handleApi(request, env, ctx, url) {
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const method = request.method.toUpperCase();

  if (path === "/me" && method === "GET") {
    return handleMe(request, env);
  }
  if (path === "/register" && method === "POST") {
    return handleRegister(request, env);
  }
  if (path === "/login" && method === "POST") {
    return handleLogin(request, env);
  }
  if (path === "/logout" && method === "POST") {
    return handleLogout(request);
  }
  if (path === "/topics" && method === "GET") {
    return handleTopics(request, env);
  }
  if (path.startsWith("/topic/") && method === "GET") {
    const slug = decodeURIComponent(path.slice("/topic/".length));
    return handleTopicDetail(request, env, slug);
  }
  if (path.startsWith("/question/") && method === "GET") {
    const id = Number(path.slice("/question/".length));
    return handleQuestionDetail(request, env, id);
  }
  if (path === "/attempts" && method === "POST") {
    return handleCreateAttempt(request, env);
  }

  if (path === "/admin/topics" && method === "GET") {
    return handleAdminListTopics(request, env);
  }
  if (path === "/admin/topics" && method === "POST") {
    return handleAdminCreateTopic(request, env);
  }
  if (path === "/admin/questions" && method === "POST") {
    return handleAdminCreateQuestion(request, env);
  }

  return json({ error: "Route not implemented" }, 404);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getUserFromSession(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/session_id=([^;]+)/);
  if (!match) return null;
  const sessionId = match[1];
  const row = await env.DB.prepare(
    "SELECT users.id, users.email, users.is_admin FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ?"
  )
    .bind(sessionId)
    .first();
  return row || null;
}

function setSessionCookie(sessionId) {
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    `session_id=${sessionId}; HttpOnly; Path=/; SameSite=Lax`
  );
  return headers;
}

function clearSessionCookie() {
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    "session_id=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
  );
  return headers;
}

async function handleMe(request, env) {
  const user = await getUserFromSession(request, env);
  return json({ user });
}

async function handleRegister(request, env) {
  const body = await readJson(request);
  if (!body || !body.email || !body.password) {
    return json({ error: "Email and password are required." }, 400);
  }

  const email = String(body.email).trim().toLowerCase();
  const password = String(body.password);
  if (!email || password.length < 6) {
    return json(
      { error: "Please provide a valid email and a password of 6+ characters." },
      400
    );
  }

  const hash = await hashPassword(password);

  try {
    const result = await env.DB.prepare(
      "INSERT INTO users (email, password_hash) VALUES (?, ?)"
    )
      .bind(email, hash)
      .run();

    const userId = result.lastInsertRowid;
    const sessionId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO sessions (id, user_id) VALUES (?, ?)"
    )
      .bind(sessionId, userId)
      .run();

    const headers = setSessionCookie(sessionId);
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers,
    });
  } catch (err) {
    if (String(err).includes("UNIQUE")) {
      return json({ error: "An account with that email already exists." }, 409);
    }
    return json({ error: "Could not create account." }, 500);
  }
}

async function handleLogin(request, env) {
  const body = await readJson(request);
  if (!body || !body.email || !body.password) {
    return json({ error: "Email and password are required." }, 400);
  }

  const email = String(body.email).trim().toLowerCase();
  const password = String(body.password);
  const hash = await hashPassword(password);

  const user = await env.DB.prepare(
    "SELECT id, email, password_hash, is_admin FROM users WHERE email = ?"
  )
    .bind(email)
    .first();

  if (!user || user.password_hash !== hash) {
    return json({ error: "Incorrect email or password." }, 401);
  }

  const sessionId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO sessions (id, user_id) VALUES (?, ?)")
    .bind(sessionId, user.id)
    .run();

  const headers = setSessionCookie(sessionId);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers,
  });
}

async function handleLogout(request) {
  const headers = clearSessionCookie();
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers,
  });
}

async function ensureSeedData(env) {
  const topicRow = await env.DB.prepare(
    "SELECT id FROM topics ORDER BY id LIMIT 1"
  ).first();
  if (topicRow) return;

  // Simple seed: one topic with two questions
  const notesHtml =
    "<p>This topic covers basic quadratic equations, factoring, and roots.</p>";
  const result = await env.DB.prepare(
    "INSERT INTO topics (title, slug, level, paper, order_index, notes_html) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind("Algebra & Equations", "algebra-equations", "HL", 1, 1, notesHtml)
    .run();
  const topicId = result.lastInsertRowid;

  await env.DB.prepare(
    "INSERT INTO questions (topic_id, text, marking_scheme, max_marks, source_ref) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(
      topicId,
      "Solve the quadratic equation 2x^2 - 3x - 5 = 0.",
      "Award full marks for correctly finding both roots with clear working. Partial credit for one correct root or correct use of quadratic formula with minor algebra slips.",
      10,
      "Sample"
    )
    .run();

  await env.DB.prepare(
    "INSERT INTO questions (topic_id, text, marking_scheme, max_marks, source_ref) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(
      topicId,
      "Sketch the graph of f(x) = 2x^2 - 3x - 5, indicating roots and vertex.",
      "Award marks for correct shape, intercepts, and vertex position. Partial credit for correct features but inaccurate scaling.",
      15,
      "Sample"
    )
    .run();
}

async function handleTopics(request, env) {
  const user = await getUserFromSession(request, env);
  if (!user) return json({ error: "Unauthorised" }, 401);

  await ensureSeedData(env);

  const topics = await env.DB.prepare(
    "SELECT id, title, slug, level, paper FROM topics ORDER BY paper, order_index, id"
  ).all();

  const attemptsAgg = await env.DB.prepare(
    "SELECT topic_id, COUNT(DISTINCT question_id) as attempted_questions, AVG(marks_awarded * 100.0 / max_marks) as avg_pct FROM attempts JOIN questions ON questions.id = attempts.question_id GROUP BY topic_id"
  ).all();

  const statsByTopic = new Map();
  for (const row of attemptsAgg.results || []) {
    statsByTopic.set(row.topic_id, row);
  }

  const topicsWithStats = [];
  for (const t of topics.results || []) {
    const stats = statsByTopic.get(t.id) || {};
    const questionsCount = await env.DB.prepare(
      "SELECT COUNT(*) as c FROM questions WHERE topic_id = ?"
    )
      .bind(t.id)
      .first();
    const completedPct = questionsCount.c
      ? Math.round(
          ((stats.attempted_questions || 0) / questionsCount.c) * 100
        )
      : 0;
    topicsWithStats.push({
      id: t.id,
      title: t.title,
      slug: t.slug,
      level: t.level,
      paper: t.paper,
      completedPct,
    });
  }

  const summaryText =
    topicsWithStats.length > 0
      ? `You have ${topicsWithStats.length} topic${
          topicsWithStats.length > 1 ? "s" : ""
        } to explore.`
      : "No topics yet.";

  return json({ topics: topicsWithStats, summaryText });
}

async function handleTopicDetail(request, env, slug) {
  const user = await getUserFromSession(request, env);
  if (!user) return json({ error: "Unauthorised" }, 401);

  await ensureSeedData(env);

  const topic = await env.DB.prepare(
    "SELECT id, title, slug, level, paper, notes_html FROM topics WHERE slug = ?"
  )
    .bind(slug)
    .first();
  if (!topic) return json({ error: "Topic not found" }, 404);

  const questions = await env.DB.prepare(
    "SELECT id, text, max_marks FROM questions WHERE topic_id = ? ORDER BY id"
  )
    .bind(topic.id)
    .all();

  const attemptedRows = await env.DB.prepare(
    "SELECT question_id, MAX(created_at) as last_time, MAX(marks_awarded) as last_mark FROM attempts WHERE user_id = ? AND question_id IN (SELECT id FROM questions WHERE topic_id = ?) GROUP BY question_id"
  )
    .bind(user.id, topic.id)
    .all();

  const lastByQuestion = new Map();
  for (const row of attemptedRows.results || []) {
    lastByQuestion.set(row.question_id, row);
  }

  const questionsOut = [];
  let idx = 1;
  for (const q of questions.results || []) {
    const last = lastByQuestion.get(q.id);
    let lastMarkText = null;
    if (last && last.last_mark != null) {
      lastMarkText = `${last.last_mark}/${q.max_marks}`;
    }
    questionsOut.push({
      id: q.id,
      text: q.text,
      max_marks: q.max_marks,
      displayNumber: idx++,
      lastMarkText,
    });
  }

  const statsRow = await env.DB.prepare(
    "SELECT COUNT(*) as total, SUM(CASE WHEN marks_awarded IS NOT NULL THEN 1 ELSE 0 END) as attempted, AVG(marks_awarded * 100.0 / max_marks) as avg_pct FROM questions LEFT JOIN attempts ON attempts.question_id = questions.id AND attempts.user_id = ? WHERE questions.topic_id = ?"
  )
    .bind(user.id, topic.id)
    .first();

  const stats = {
    total: statsRow.total || 0,
    attempted: statsRow.attempted || 0,
    avgMarkPct: statsRow.avg_pct ? Math.round(statsRow.avg_pct) : 0,
  };

  return json({
    topic: {
      id: topic.id,
      title: topic.title,
      slug: topic.slug,
      level: topic.level,
      paper: topic.paper,
      notesHtml: topic.notes_html,
    },
    questions: questionsOut,
    stats,
  });
}

async function handleQuestionDetail(request, env, id) {
  const user = await getUserFromSession(request, env);
  if (!user) return json({ error: "Unauthorised" }, 401);

  const question = await env.DB.prepare(
    "SELECT id, topic_id, text, max_marks FROM questions WHERE id = ?"
  )
    .bind(id)
    .first();
  if (!question) return json({ error: "Question not found" }, 404);

  const topic = await env.DB.prepare(
    "SELECT id, title, level, paper FROM topics WHERE id = ?"
  )
    .bind(question.topic_id)
    .first();

  const attempts = await env.DB.prepare(
    "SELECT id, marks_awarded, created_at FROM attempts WHERE user_id = ? AND question_id = ? ORDER BY created_at DESC LIMIT 3"
  )
    .bind(user.id, id)
    .all();

  let displayNumber = 1;
  const siblings = await env.DB.prepare(
    "SELECT id FROM questions WHERE topic_id = ? ORDER BY id"
  )
    .bind(question.topic_id)
    .all();
  let idx = 1;
  for (const row of siblings.results || []) {
    if (row.id === question.id) {
      displayNumber = idx;
      break;
    }
    idx++;
  }

  return json({
    question: {
      id: question.id,
      text: question.text,
      max_marks: question.max_marks,
      displayNumber,
    },
    topic,
    attempts: attempts.results || [],
  });
}

async function handleCreateAttempt(request, env) {
  const user = await getUserFromSession(request, env);
  if (!user) return json({ error: "Unauthorised" }, 401);

  const body = await readJson(request);
  if (!body || !body.questionId || !body.answerText) {
    return json({ error: "questionId and answerText are required." }, 400);
  }

  const question = await env.DB.prepare(
    "SELECT id, text, marking_scheme, max_marks FROM questions WHERE id = ?"
  )
    .bind(body.questionId)
    .first();
  if (!question) return json({ error: "Question not found" }, 404);

  const mode = body.mode === "explain" ? "explain" : "mark";
  const answerText = String(body.answerText);
  const lengthScore = Math.min(answerText.length / 120, 1);
  let marksAwarded =
    mode === "mark" ? Math.round(question.max_marks * lengthScore) : null;

  let feedback = {
    scoreText:
      mode === "mark" && marksAwarded != null
        ? `${marksAwarded}/${question.max_marks}`
        : "Explanation only",
    summary:
      mode === "mark"
        ? "This prototype gives a rough score based on how complete your answer looks."
        : "Here is a straightforward outline of how to approach the question.",
    steps: [
      "State what the question is asking you to find.",
      "Write down the key formula or relationship you will use.",
      "Substitute in the values and simplify carefully.",
      "Check that your final answer makes sense.",
    ],
  };

  const aiFeedback = await maybeRunGemini(env, {
    mode,
    question,
    answerText,
  });

  if (aiFeedback) {
    feedback = {
      scoreText:
        aiFeedback.marksAwarded != null
          ? `${aiFeedback.marksAwarded}/${question.max_marks}`
          : "Explanation only",
      summary: aiFeedback.summary || feedback.summary,
      steps: aiFeedback.steps?.length ? aiFeedback.steps : feedback.steps,
    };
    marksAwarded = aiFeedback.marksAwarded ?? marksAwarded;
  }

  const feedbackJson = JSON.stringify(feedback);

  await env.DB.prepare(
    "INSERT INTO attempts (user_id, question_id, answer_text, marks_awarded, feedback_json) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(user.id, question.id, answerText, marksAwarded, feedbackJson)
    .run();

  return json({ ok: true, feedback });
}

async function maybeRunGemini(env, { mode, question, answerText }) {
  if (!env.GOOGLE_API_KEY) return null;

  const prompt = buildGeminiPrompt({ mode, question, answerText });

  try {
    const resp = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent" +
        `?key=${env.GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 400,
          },
        }),
      }
    );

    if (!resp.ok) {
      console.warn("Gemini request failed", resp.status, await resp.text());
      return null;
    }

    const data = await resp.json();
    const text = extractGeminiText(data);
    const parsed = parseGeminiFeedback(text);

    if (!parsed) return null;

    const marksAwarded =
      mode === "mark"
        ? clampMarks(parsed.marks_awarded, question.max_marks)
        : null;

    return {
      marksAwarded,
      summary: parsed.summary || parsed.comment,
      steps: Array.isArray(parsed.steps)
        ? parsed.steps.slice(0, 6).filter((s) => typeof s === "string" && s.trim())
        : [],
    };
  } catch (err) {
    console.warn("Gemini error", err);
    return null;
  }
}

function buildGeminiPrompt({ mode, question, answerText }) {
  const instructions =
    mode === "mark"
      ? `Score the learner's answer for a Leaving Cert maths question.
Return JSON with keys: marks_awarded (integer 0-${question.max_marks}), summary (1-2 calm sentences), and steps (array of 3-6 short bullet points).
Keep the tone factual and supportive.`
      : `Give a short walkthrough for a Leaving Cert maths question.
Return JSON with keys: summary (1-2 calm sentences) and steps (array of 3-6 short bullet points).`;

  const markingScheme = question.marking_scheme
    ? `Marking scheme: ${question.marking_scheme}`
    : "";

  return `${instructions}

Question (max ${question.max_marks} marks): ${question.text}
${markingScheme}

Learner answer:
${answerText}`;
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("\n")
    .trim();
}

function parseGeminiFeedback(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (err) {
    console.warn("Gemini JSON parse error", err, text);
    return null;
  }
}

function clampMarks(value, max) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(max, Math.round(value)));
}

async function requireAdmin(request, env) {
  const user = await getUserFromSession(request, env);
  if (!user || !user.is_admin) {
    return { errorResponse: json({ error: "Admin only" }, 403), user: null };
  }
  return { errorResponse: null, user };
}

async function handleAdminListTopics(request, env) {
  const { errorResponse } = await requireAdmin(request, env);
  if (errorResponse) return errorResponse;

  const topics = await env.DB.prepare(
    "SELECT id, title, slug, level, paper FROM topics ORDER BY paper, order_index, id"
  ).all();

  return json({ topics: topics.results || [] });
}

async function handleAdminCreateTopic(request, env) {
  const { errorResponse } = await requireAdmin(request, env);
  if (errorResponse) return errorResponse;

  const body = await readJson(request);
  if (!body || !body.title || !body.slug || !body.level || !body.paper) {
    return json({ error: "title, slug, level, paper are required." }, 400);
  }

  try {
    await env.DB.prepare(
      "INSERT INTO topics (title, slug, level, paper, order_index, notes_html) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(
        String(body.title),
        String(body.slug),
        String(body.level),
        Number(body.paper),
        Number(body.order_index || 0),
        String(body.notes_html || "")
      )
      .run();
  } catch (err) {
    if (String(err).includes("UNIQUE")) {
      return json({ error: "Slug already exists." }, 409);
    }
    return json({ error: "Could not create topic." }, 500);
  }

  return json({ ok: true });
}

async function handleAdminCreateQuestion(request, env) {
  const { errorResponse, user } = await requireAdmin(request, env);
  if (errorResponse) return errorResponse;

  const body = await readJson(request);
  if (
    !body ||
    !body.topic_id ||
    !body.text ||
    !body.marking_scheme ||
    !body.max_marks
  ) {
    return json(
      { error: "topic_id, text, marking_scheme, max_marks are required." },
      400
    );
  }

  await env.DB.prepare(
    "INSERT INTO questions (topic_id, text, marking_scheme, max_marks, source_ref) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(
      Number(body.topic_id),
      String(body.text),
      String(body.marking_scheme),
      Number(body.max_marks),
      body.source_ref ? String(body.source_ref) : null
    )
    .run();

  return json({ ok: true });
}





