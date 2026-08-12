import type { Integration } from '../types';

const pydanticAi: Integration = {
  id: 'pydantic-ai',
  title: 'Pydantic AI',
  category: 'framework',
  language: 'python',
  streamFormat: 'openai-sse',
  envVars: ['OPENAI_API_KEY'],
  routeTemplates: {
    fastapi: `# main.py
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pydantic_ai import Agent

agent = Agent('openai:gpt-4o')

app = FastAPI()
app.add_middleware(
    CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*']
)

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: list[Message]

async def openai_sse(messages: list[Message]):
    prompt = messages[-1].content if messages else ''
    async with agent.run_stream(prompt) as result:
        async for delta in result.stream_text(delta=True):
            chunk = {'choices': [{'delta': {'content': delta}}]}
            yield f'data: {json.dumps(chunk)}\\n\\n'
    yield 'data: [DONE]\\n\\n'

@app.post('/api/chat')
async def chat(req: ChatRequest):
    return StreamingResponse(openai_sse(req.messages), media_type='text/event-stream')`,
  },
  streamMapping:
    "Pydantic AI's agent.run_stream() yields text deltas via result.stream_text(delta=True). Each delta is re-framed as a data: {choices:[{delta:{content}}]} SSE line and the stream closes with data: [DONE]. readOpenAIStream from @kitn.ai/ui/wire parses tool calls and reasoning too, but stream_text() yields text only: iterate the run's events instead and re-frame its tool-call events onto delta.tool_calls to fill kai-tool.",
  // No install list here: `deps` below is the one, and the scaffolder emits it.
  // This sentence used to open "Install: pip install pydantic-ai fastapi
  // uvicorn." — three of the four packages, missing the `pydantic` its own route
  // imports on the next line.
  runNote:
    'Set OPENAI_API_KEY. Run: uvicorn main:app --reload (default port 8000). Point kai-chat at http://localhost:8000/api/chat.',
  docsSlug: 'integrations/pydantic-ai',
  // Nothing. Agent('openai:gpt-4o') pins the model and the agent registers its
  // own tools, both server-side.
  forwardsFromClient: [],
  // The only python integration, so the only non-empty `pip`. Three of the four
  // are the route's own imports (`pydantic_ai` is imported under its module
  // name and installed under its hyphenated one); `uvicorn` is the ASGI server
  // the run note starts, which nothing imports and without which the app cannot
  // run. That asymmetry is why the pip guard checks imports ⊆ declared and not
  // the reverse.
  deps: { npm: [], pip: ['pydantic-ai', 'fastapi', 'pydantic', 'uvicorn'] },
  // Agent('openai:gpt-4o') reads OPENAI_API_KEY inside the python process.
  //
  // Worth being precise about, because this one looks like an exception: the
  // FastAPI app sets CORS to allow_origins=['*'] and the browser fetches it
  // DIRECTLY on :8000, with no JS proxy in front. That still is not
  // 'frontend-safe' — the flag asks where the SECRET lives, and it lives in the
  // python process. The FastAPI service IS the server hop.
  keyExposure: 'needs-proxy',
  // The emitted backend is a FastAPI service: a python interpreter, the four
  // `deps.pip` packages, and `uvicorn main:app` on its own port — none of which a
  // node toolchain provides or starts. It also needs OPENAI_API_KEY, so this is
  // the entry that proves the groups are not mutually exclusive: a runtime
  // prerequisite and a key at once. The prompt should lead with the runtime,
  // because a key is useless until the service runs. The schema's `language ===
  // 'python'` net catches this one independently.
  outOfBand: 'language-runtime',
};

export default pydanticAi;
