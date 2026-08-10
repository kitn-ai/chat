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
    "Pydantic AI's agent.run_stream() yields text deltas via result.stream_text(delta=True). Each delta is re-framed as a data: {choices:[{delta:{content}}]} SSE line and the stream closes with data: [DONE]. readOpenAIStream from @kitn.ai/ui/wire parses it, including tool calls and reasoning.",
  runNote:
    'Install: pip install pydantic-ai fastapi uvicorn. Set OPENAI_API_KEY. Run: uvicorn main:app --reload (default port 8000). Point kai-chat at http://localhost:8000/api/chat.',
  docsSlug: 'integrations/pydantic-ai',
};

export default pydanticAi;
