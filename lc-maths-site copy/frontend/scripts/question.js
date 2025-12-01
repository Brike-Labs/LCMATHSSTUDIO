// Logic for loading a question, submitting an answer, and showing feedback

function getQueryParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

async function loadMe() {
  try {
    const data = await window.apiFetch("/me", { method: "GET" });
    return data.user;
  } catch {
    return null;
  }
}

function renderFeedback(feedback) {
  const feedbackSection = document.getElementById("feedback");
  const scoreEl = document.getElementById("feedback-score");
  const bodyEl = document.getElementById("feedback-body");
  const stepsEl = document.getElementById("feedback-steps");

  if (!feedbackSection) return;

  feedbackSection.hidden = false;
  scoreEl.textContent =
    typeof feedback.scoreText === "string" ? feedback.scoreText : "";
  bodyEl.textContent =
    typeof feedback.summary === "string"
      ? feedback.summary
      : "Here is some feedback on your answer.";

  stepsEl.innerHTML = "";
  if (Array.isArray(feedback.steps) && feedback.steps.length > 0) {
    const ul = document.createElement("ul");
    feedback.steps.forEach((step) => {
      const li = document.createElement("li");
      li.textContent = step;
      ul.appendChild(li);
    });
    stepsEl.appendChild(ul);
  }
}

async function loadQuestion() {
  const user = await loadMe();
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const id = getQueryParam("id");
  if (!id) {
    window.location.href = "dashboard.html";
    return;
  }

  const topicSlug = getQueryParam("topic");
  if (topicSlug) {
    const backToTopic = document.getElementById("back-to-topic");
    if (backToTopic) {
      backToTopic.href = `topic.html?slug=${encodeURIComponent(topicSlug)}`;
    }
  }

  const titleEl = document.getElementById("question-title");
  const topicLabelEl = document.getElementById("question-topic-label");
  const textEl = document.getElementById("question-text");
  const marksEl = document.getElementById("question-marks");
  const attemptsSection = document.getElementById("recent-attempts");
  const attemptsList = document.getElementById("attempts-list");

  try {
    const data = await window.apiFetch(`/question/${id}`, { method: "GET" });
    const { question, topic, attempts } = data;
    titleEl.textContent = `Question ${question.displayNumber}`;
    topicLabelEl.textContent = `${topic.title} · ${topic.level} · Paper ${topic.paper}`;
    textEl.innerHTML = question.text_html || question.text;
    marksEl.textContent = `${question.max_marks} marks`;

    if (attempts && attempts.length > 0) {
      attemptsSection.hidden = false;
      attemptsList.innerHTML = "";
      attempts.forEach((a) => {
        const li = document.createElement("li");
        li.textContent = `${a.created_at} · ${a.marks_awarded ?? "—"} marks`;
        attemptsList.appendChild(li);
      });
    }
  } catch (err) {
    const errorEl = document.getElementById("answer-error");
    errorEl.textContent = err.message || "Could not load question.";
    errorEl.hidden = false;
  }
}

async function submitAnswer(mode) {
  const id = getQueryParam("id");
  const answerText = document.getElementById("answer-text").value;
  const errorEl = document.getElementById("answer-error");
  errorEl.hidden = true;
  errorEl.textContent = "";

  if (!answerText.trim()) {
    errorEl.textContent = "Please type your answer first.";
    errorEl.hidden = false;
    return;
  }

  try {
    const data = await window.apiFetch("/attempts", {
      method: "POST",
      body: JSON.stringify({
        questionId: Number(id),
        answerText,
        mode,
      }),
    });
    renderFeedback(data.feedback || {});
  } catch (err) {
    errorEl.textContent =
      err.message || "Something went wrong while submitting.";
    errorEl.hidden = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (!document.body.classList.contains("app--question")) return;

  loadQuestion();

  const form = document.getElementById("answer-form");
  const explainBtn = document.getElementById("explain-btn");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitAnswer("mark");
  });

  explainBtn.addEventListener("click", () => {
    submitAnswer("explain");
  });
});


