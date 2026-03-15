import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

router = APIRouter()

# Simple mock for the LLM logic for now, later we'll integrate langchain properly.
class Message(BaseModel):
    role: str # "user" or "agent"
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    
class ChatResponse(BaseModel):
    response: str
    is_finalized: bool
    research_intent: Optional[str] = None

SYSTEM_PROMPT = """You are the MRX Agent (Teal). Your goal is to move beyond a basic "brief" into a deep understanding of the client's business anxiety.
When the client gives a topic (e.g. "Understand EVs in Bangalore"), probe for the "Why". Ask things like "Is this an infrastructure anxiety or a brand trust crisis?".
Keep your responses concise and consultative. 
If you feel you have a finalized Research Intent Statement that serves as a North Star for the study, begin your response with "FINAL_INTENT: " followed by the intent statement.
"""

def generate_mock_response(messages: List[Message]) -> ChatResponse:
    # A very basic mock logic to simulate the flow without requiring an API key immediately
    if len(messages) == 1:
        return ChatResponse(
            response="I understand you want to research that. Could you clarify: is this an infrastructure anxiety, a brand trust crisis, or a competitive landscaping need?",
            is_finalized=False
        )
    elif len(messages) > 3:
        # After a few messages, finalize
        return ChatResponse(
            response="Thank you. I have enough information to form our North Star.",
            is_finalized=True,
            research_intent=f"Investigate {messages[0].content} focusing on the specific anxieties discussed, to map the surrounding ecosystem."
        )
    else:
        return ChatResponse(
            response="That's helpful context. What specific metrics or competitor actions are you most worried about?",
            is_finalized=False
        )

@router.post("/chat", response_model=ChatResponse)
def intake_chat(request: ChatRequest):
    try:
        # Here we would normally plug into LLM with LangChain
        # For development, we'll use the mock logic
        return generate_mock_response(request.messages)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
