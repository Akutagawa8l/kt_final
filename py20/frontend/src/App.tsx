import { useEffect, useState } from "react";

type Task = {
  id: string;
  title: string;
  status: string;
};

const GRAPHQL_URL = "http://127.0.0.1:8000/graphql";
const WS_URL = "ws://127.0.0.1:8000/ws";

async function fetchGraphQL(
  query: string,
  variables: Record<string, unknown> = {},
) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [connected, setConnected] = useState(false);

  const loadTasks = async () => {
    try {
      const res = await fetchGraphQL(`
        query {
          tasks {
            id
            title
            status
          }
        }
      `);
      if (res.data?.tasks) {
        setTasks(res.data.tasks);
      }
    } catch (err) {
      console.error("Ошибка загрузки задач:", err);
    }
  };

  useEffect(() => {
    loadTasks();

    const ws = new WebSocket(WS_URL);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "TASK_ADDED") {
        setTasks((prev) =>
          prev.some((t) => t.id === msg.task.id) ? prev : [...prev, msg.task],
        );
      } else if (msg.type === "TASK_UPDATED") {
        setTasks((prev) =>
          prev.map((t) => (t.id === msg.task.id ? msg.task : t)),
        );
      } else if (msg.type === "TASK_DELETED") {
        setTasks((prev) => prev.filter((t) => t.id !== msg.id));
      }
    };

    return () => ws.close();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const res = await fetchGraphQL(
      `
      mutation AddTask($title: String!) {
        addTask(title: $title) {
          id
          title
          status
        }
      }
      `,
      { title: title.trim() },
    );
    if (res.data?.addTask) {
      setTasks((prev) =>
        prev.some((t) => t.id === res.data.addTask.id)
          ? prev
          : [...prev, res.data.addTask],
      );
    }
    setTitle("");
  };

  const handleStatusChange = async (id: string, status: string) => {
    const res = await fetchGraphQL(
      `
      mutation UpdateStatus($id: String!, $status: String!) {
        updateTaskStatus(id: $id, status: $status) {
          id
          title
          status
        }
      }
      `,
      { id, status },
    );
    if (res.data?.updateTaskStatus) {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? res.data.updateTaskStatus : t)),
      );
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetchGraphQL(
      `
      mutation DeleteTask($id: String!) {
        deleteTask(id: $id)
      }
      `,
      { id },
    );
    if (res.data?.deleteTask) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const columns = [
    { key: "todo", label: "К выполнению" },
    { key: "in_progress", label: "В работе" },
    { key: "done", label: "Готово" },
  ];

  return (
    <div
      style={{
        fontFamily: "sans-serif",
        maxWidth: 900,
        margin: "30px auto",
        padding: "0 20px",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h1>Доска</h1>
        <span
          style={{
            color: connected ? "#22c55e" : "#ef4444",
            fontWeight: "bold",
          }}
        >
          {connected ? "● WebSocket онлайн" : "○ Отключено"}
        </span>
      </header>

      <form
        onSubmit={handleAdd}
        style={{ display: "flex", gap: 10, marginBottom: 30 }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Новая задача..."
          style={{ flex: 1, padding: 10, fontSize: 16 }}
        />
        <button
          type="submit"
          style={{ padding: "10px 20px", fontSize: 16, cursor: "pointer" }}
        >
          Добавить
        </button>
      </form>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 20,
        }}
      >
        {columns.map((col) => (
          <div
            key={col.key}
            style={{
              background: "#f4f4f5",
              color: "#111",
              padding: 15,
              borderRadius: 8,
              minHeight: 300,
            }}
          >
            <h3 style={{ marginTop: 0 }}>{col.label}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {tasks
                .filter((t) => t.status === col.key)
                .map((task) => (
                  <div
                    key={task.id}
                    style={{
                      background: "#fff",
                      color: "#111",
                      padding: 12,
                      borderRadius: 6,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                    }}
                  >
                    <p style={{ margin: "0 0 10px 0", fontWeight: 500 }}>
                      {task.title}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 5,
                      }}
                    >
                      <select
                        value={task.status}
                        onChange={(e) =>
                          handleStatusChange(task.id, e.target.value)
                        }
                      >
                        <option value="todo">К выполнению</option>
                        <option value="in_progress">В работе</option>
                        <option value="done">Готово</option>
                      </select>
                      <button
                        onClick={() => handleDelete(task.id)}
                        style={{ color: "red", cursor: "pointer" }}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
