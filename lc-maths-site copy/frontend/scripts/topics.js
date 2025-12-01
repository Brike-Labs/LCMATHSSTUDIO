// Logic for dashboard topics list and topic page

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

async function loadDashboard() {
  const user = await loadMe();
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const footerUser = document.getElementById("footer-user");
  if (footerUser) {
    footerUser.textContent = user.email;
  }

  const topicsGrid = document.getElementById("topics-grid");
  const errorEl = document.getElementById("topics-error");
  const summaryEl = document.getElementById("dashboard-summary");

  try {
    const data = await window.apiFetch("/topics", { method: "GET" });
    const topics = data.topics || [];

    if (summaryEl) {
      summaryEl.textContent = data.summaryText || "";
    }

    topicsGrid.innerHTML = "";
    topics.forEach((topic) => {
      const card = document.createElement("article");
      card.className = "card card--topic";
      const link = document.createElement("a");
      link.href = `topic.html?slug=${encodeURIComponent(topic.slug)}`;
      link.innerHTML = `<h3>${topic.title}</h3>
        <p>${topic.level} · Paper ${topic.paper}</p>
        <p class=\"form__hint\">${topic.completedPct}% complete</p>`;
      card.appendChild(link);
      topicsGrid.appendChild(card);
    });
  } catch (err) {
    errorEl.textContent = err.message || "Could not load topics.";
    errorEl.hidden = false;
  }
}

async function loadTopicPage() {
  const user = await loadMe();
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const slug = getQueryParam("slug");
  if (!slug) {
    window.location.href = "dashboard.html";
    return;
  }

  const titleEl = document.getElementById("topic-title");
  const paperEl = document.getElementById("topic-paper");
  const leadEl = document.getElementById("topic-lead");
  const notesEl = document.getElementById("topic-notes");
  const questionsList = document.getElementById("questions-list");
  const progressEl = document.getElementById("topic-progress");
  const errorEl = document.getElementById("topic-error");

  try {
    const data = await window.apiFetch(`/topic/${encodeURIComponent(slug)}`, {
      method: "GET",
    });
    const { topic, questions, stats } = data;
    titleEl.textContent = topic.title;
    paperEl.textContent = `${topic.level} · Paper ${topic.paper}`;
    leadEl.textContent =
      "Work through these questions and check your understanding.";
    notesEl.innerHTML = topic.notesHtml || "";
    progressEl.textContent = `You have attempted ${stats.attempted}/${stats.total} questions (avg ${stats.avgMarkPct}%).`;

    questionsList.innerHTML = "";
    questions.forEach((q) => {
      const card = document.createElement("article");
      card.className = "card";
      const link = document.createElement("a");
      link.href = `question.html?id=${q.id}&topic=${encodeURIComponent(
        slug
      )}`;
      link.innerHTML = `<h3>Question ${q.displayNumber}</h3>
        <p class=\"form__hint\">${q.max_marks} marks · Last score: ${
          q.lastMarkText || "—"
        }</p>`;
      card.appendChild(link);
      questionsList.appendChild(card);
    });
  } catch (err) {
    errorEl.textContent = err.message || "Could not load topic.";
    errorEl.hidden = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.body.classList.contains("app--dashboard")) {
    loadDashboard();
  }
  if (document.body.classList.contains("app--topic")) {
    loadTopicPage();
  }
});


