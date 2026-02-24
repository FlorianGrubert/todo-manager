import express from "express";
import cors from "cors";
import path from "path";
import {
  getStatuses,
  getTeamMembers,
  addTeamMember,
  getToDos,
  addToDo,
  updateToDo,
  deleteToDo
} from "./data/store";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

app.get("/api/statuses", (_req, res) => {
  res.json(getStatuses());
});

app.get("/api/team-members", (_req, res) => {
  res.json(getTeamMembers());
});

app.post("/api/team-members", (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Name is required" });
  }
  const member = addTeamMember(name.trim());
  res.status(201).json(member);
});

app.get("/api/todos", (_req, res) => {
  res.json(getToDos());
});

app.post("/api/todos", (req, res) => {
  try {
    const todo = addToDo(req.body);
    res.status(201).json(todo);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.put("/api/todos/:id", (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  try {
    const todo = updateToDo(id, req.body);
    res.json(todo);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.delete("/api/todos/:id", (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  deleteToDo(id);
  res.status(204).end();
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`ToDo-Manager server running on http://localhost:${port}`);
});

