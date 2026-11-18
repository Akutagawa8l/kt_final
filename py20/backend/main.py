import uuid
from typing import List
import strawberry
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from strawberry.fastapi import GraphQLRouter


@strawberry.type
class Task:
    id: str
    title: str
    status: str


tasks_db: List[Task] = [
    Task(id=str(uuid.uuid4()), title="Изучить FastAPI и GraphQL", status="done"),
    Task(id=str(uuid.uuid4()), title="Настроить WebSocket", status="in_progress"),
    Task(id=str(uuid.uuid4()), title="Собрать React клиент", status="todo"),
]


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            await connection.send_json(message)


manager = ConnectionManager()


@strawberry.type
class Query:
    @strawberry.field
    def tasks(self) -> List[Task]:
        return tasks_db


@strawberry.type
class Mutation:
    @strawberry.mutation
    async def add_task(self, title: str, status: str = "todo") -> Task:
        new_task = Task(id=str(uuid.uuid4()), title=title, status=status)
        tasks_db.append(new_task)
        await manager.broadcast({
            "type": "TASK_ADDED",
            "task": {"id": new_task.id, "title": new_task.title, "status": new_task.status},
        })
        return new_task

    @strawberry.mutation
    async def update_task_status(self, id: str, status: str) -> Task | None:
        for task in tasks_db:
            if task.id == id:
                task.status = status
                await manager.broadcast({
                    "type": "TASK_UPDATED",
                    "task": {"id": task.id, "title": task.title, "status": task.status},
                })
                return task
        return None

    @strawberry.mutation
    async def delete_task(self, id: str) -> bool:
        global tasks_db
        initial_len = len(tasks_db)
        tasks_db = [t for t in tasks_db if t.id != id]
        if len(tasks_db) < initial_len:
            await manager.broadcast({"type": "TASK_DELETED", "id": id})
            return True
        return False


schema = strawberry.Schema(query=Query, mutation=Mutation)
graphql_app = GraphQLRouter(schema)

app = FastAPI(title="TaskBoard GraphQL + WS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(graphql_app, prefix="/graphql")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
