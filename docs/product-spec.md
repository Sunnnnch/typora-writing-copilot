# Product Spec

## Product Definition

Typrism is a standalone Typora plugin focused on writing assistance.
It should feel like a native writing companion instead of a full-screen chat application.

## Target Scenarios

1. Rewrite selected text without leaving Typora.
2. Ask questions about the current document.
3. Search the web for supporting sources and insert cited summaries.
4. Continue drafting from the current context.

## Primary Presentation

### Right-side AI Panel

The main surface is a compact right-side panel.
It supports:

- streaming replies
- multi-turn chat
- mode switching
- context switching
- quick result actions

### Selection Floating Toolbar

When the user selects text, a lightweight toolbar appears near the selection.
It exposes high-frequency actions:

- rewrite
- shorten
- expand
- translate
- summarize
- search

### Result Preview

Rewrite-like actions should never overwrite content immediately.
Every generated result must support:

- replace selection
- insert below
- copy

## Non-Goals

- no autonomous agent execution in v1
- no plugin marketplace
- no persistent knowledge base
- no automatic document-wide rewriting without confirmation

## MVP Features

### AI Chat

- multi-turn conversation
- selection/document/no-context scope
- streaming output
- markdown-friendly result rendering

### Selection Rewrite

- preset rewrite instructions
- preview before apply
- selection restore when possible

### Document Q&A

- ask against the current file
- explicit confirm before sending full document

### Web Search

- search external sources
- synthesize cited markdown summary
- insert sources list into document

### Authentication

- API key mode

## Authentication Strategy

### API Key

Supported for:

- OpenAI
- Gemini
- DeepSeek
- Qwen
- Moonshot
- Zhipu
- OpenRouter
- OpenAI-compatible endpoints

## UX Principles

- writing first, configuration second
- default compact UI
- advanced controls collapsed by default
- never silently send whole-document context
- always preserve user control over final insertion
