// Simple admin panel: list topics, create topics, create questions

async function adminLoadTopics() {
  const listEl = document.getElementById("admin-topics-list");
  const errorEl = document.getElementById("admin-topics-error");
  const selectEl = document.getElementById("admin-question-topic");

  errorEl.hidden = true;
  errorEl.textContent = "";

  try {
    const data = await window.apiFetch("/admin/topics", { method: "GET" });
    const topics = data.topics || [];

    listEl.innerHTML = "";
    selectEl.innerHTML = "";

    topics.forEach((t) => {
      const card = document.createElement("article");
      card.className = "card card--topic";
      card.innerHTML = `<h3>${t.title}</h3>
        <p>${t.level} · Paper ${t.paper}</p>
        <p class="form__hint">${t.slug}</p>`;
      listEl.appendChild(card);

      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = `${t.title} (${t.level} · P${t.paper})`;
      selectEl.appendChild(opt);
    });
  } catch (err) {
    errorEl.textContent = err.message || "Could not load topics.";
    errorEl.hidden = false;
  }
}

async function handleAdminTopicSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const errorEl = document.getElementById("admin-topic-error");
  errorEl.hidden = true;
  errorEl.textContent = "";

  const body = {
    title: form.title.value.trim(),
    slug: form.slug.value.trim(),
    level: form.level.value.trim(),
    paper: Number(form.paper.value),
    notes_html: form.notes_html.value,
  };

  try {
    await window.apiFetch("/admin/topics", {
      method: "POST",
      body: JSON.stringify(body),
    });
    form.reset();
    await adminLoadTopics();
  } catch (err) {
    errorEl.textContent = err.message || "Could not save topic.";
    errorEl.hidden = false;
  }
}

async function handleAdminQuestionSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const errorEl = document.getElementById("admin-question-error");
  errorEl.hidden = true;
  errorEl.textContent = "";

  const body = {
    topic_id: Number(form.topic_id.value),
    text: form.text.value,
    marking_scheme: form.marking_scheme.value,
    max_marks: Number(form.max_marks.value),
    source_ref: form.source_ref.value.trim() || null,
  };

  try {
    await window.apiFetch("/admin/questions", {
      method: "POST",
      body: JSON.stringify(body),
    });
    form.reset();
  } catch (err) {
    errorEl.textContent = err.message || "Could not save question.";
    errorEl.hidden = false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.body.classList.contains("app--admin")) return;

  // Ensure only admins get here
  try {
    const me = await window.apiFetch("/me", { method: "GET" });
    if (!me.user || !me.user.is_admin) {
      window.location.href = "dashboard.html";
      return;
    }
  } catch {
    window.location.href = "login.html";
    return;
  }

  await adminLoadTopics();

  const topicForm = document.getElementById("admin-topic-form");
  const questionForm = document.getElementById("admin-question-form");

  topicForm.addEventListener("submit", handleAdminTopicSubmit);
  questionForm.addEventListener("submit", handleAdminQuestionSubmit);
});


