from langgraph.graph import END, START, StateGraph

from app.config import get_settings
from app.graph.nodes import (
    extract_authors,
    fallback,
    generate_answer,
    grade_groundedness,
    grade_relevance,
    retrieve_documents,
    rewrite_query,
    route_question,
)
from app.graph.state import ResearchState
from app.internal.schemas import ChatRequest, ChatResponse


def _after_route(state: ResearchState) -> str:
    return state["route"]


def _after_relevance(state: ResearchState) -> str:
    if state.get("documents_relevant"):
        return "generate"
    if state.get("selected_document_ids") == []:
        return "fallback"
    return "rewrite" if state.get("retry_count", 0) < get_settings().max_retry_count else "fallback"


def _after_grounding(state: ResearchState) -> str:
    if state.get("grounded"):
        return "done"
    return "rewrite" if state.get("retry_count", 0) < get_settings().max_retry_count else "fallback"


def build_workflow():
    graph = StateGraph(ResearchState)
    graph.add_node("route", route_question)
    graph.add_node("retrieve", retrieve_documents)
    graph.add_node("relevance", grade_relevance)
    graph.add_node("generate", generate_answer)
    graph.add_node("grounding", grade_groundedness)
    graph.add_node("rewrite", rewrite_query)
    graph.add_node("fallback", fallback)
    graph.add_node("authors", extract_authors)

    graph.add_edge(START, "route")
    graph.add_conditional_edges(
        "route", _after_route,
        {"retrieve": "retrieve", "fallback": "fallback", "authors": "authors"},
    )
    graph.add_edge("retrieve", "relevance")
    graph.add_conditional_edges(
        "relevance", _after_relevance,
        {"generate": "generate", "rewrite": "rewrite", "fallback": "fallback"},
    )
    graph.add_edge("generate", "grounding")
    graph.add_conditional_edges(
        "grounding", _after_grounding,
        {"done": END, "rewrite": "rewrite", "fallback": "fallback"},
    )
    graph.add_edge("rewrite", "retrieve")
    graph.add_edge("fallback", END)
    graph.add_edge("authors", END)
    return graph.compile()


WORKFLOW = build_workflow()


def answer_chat(request: ChatRequest) -> ChatResponse:
    result = WORKFLOW.invoke(
        {
            "user_id": request.user_id,
            "question": request.question,
            "chat_history": request.chat_history,
            "available_documents": request.available_documents,
            "selected_document_ids": request.selected_document_ids,
            "retrieval_query": request.question,
            "retrieved_documents": [],
            "answer": "",
            "retry_count": 0,
            "documents_relevant": False,
            "grounded": False,
            "sources": [],
        }
    )
    return ChatResponse(
        answer=result["answer"],
        sources=result.get("sources", []),
        retry_count=result.get("retry_count", 0),
        documents_relevant=result.get("documents_relevant", False),
        grounded=result.get("grounded", False),
    )
