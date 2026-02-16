import React, { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Sparkles, Loader2, ChevronDown, Maximize2, Minimize2 } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatContext {
  type: 'phenomenon' | 'report'
  name?: string
  title?: string
  category?: string
  description?: string
  summary?: string
  location?: string
  phenomenon?: string
  reportCount?: number
}

interface AskTheUnknownProps {
  context?: ChatContext
  suggestedQuestions?: string[]
}

var SESSION_KEY = 'paradocs_chat_history'

function loadSessionMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return []
  try {
    var stored = sessionStorage.getItem(SESSION_KEY)
    if (stored) return JSON.parse(stored)
  } catch (e) {}
  return []
}

function saveSessionMessages(messages: ChatMessage[]) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages.slice(-20)))
  } catch (e) {}
}

export default function AskTheUnknown({ context, suggestedQuestions }: AskTheUnknownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasInteracted, setHasInteracted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const defaultQuestions = suggestedQuestions || getDefaultQuestions(context)

  // Load persisted messages on mount
  useEffect(function() {
    var stored = loadSessionMessages()
    if (stored.length > 0) {
      setMessages(stored)
      setHasInteracted(true)
    }
  }, [])

  // Persist messages when they change
  useEffect(function() {
    if (messages.length > 0) {
      saveSessionMessages(messages)
    }
  }, [messages])

  useEffect(function() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(function() {
    if (isOpen && inputRef.current) {
      setTimeout(function() { inputRef.current?.focus() }, 300)
    }
  }, [isOpen])

  function getDefaultQuestions(ctx?: ChatContext): string[] {
    if (!ctx) return [
      'What are the most common paranormal phenomena?',
      'Tell me about recent UFO sightings',
      'What\'s the most credible Bigfoot evidence?'
    ]
    if (ctx.type === 'phenomenon') return [
      `What is ${ctx.name}?`,
      `What's the best evidence for ${ctx.name}?`,
      `How many ${ctx.name} sightings have been reported?`
    ]
    if (ctx.type === 'report') return [
      'Is this report credible?',
      'Are there similar reports nearby?',
      'What could explain this sighting?'
    ]
    return []
  }

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return
    setHasInteracted(true)
    var userMsg: ChatMessage = { role: 'user', content: text.trim() }
    setMessages(function(prev) { return prev.concat([userMsg]) })
    setInput('')
    setLoading(true)
    try {
      var res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          context: context,
          history: messages.slice(-6)
        })
      })
      if (res.ok) {
        var data = await res.json()
        setMessages(function(prev) { return prev.concat([{ role: 'assistant', content: data.reply }]) })
      } else {
        setMessages(function(prev) { return prev.concat([{ role: 'assistant', content: 'I\'m having trouble connecting right now. Please try again in a moment.' }]) })
      }
    } catch (error) {
      setMessages(function(prev) { return prev.concat([{ role: 'assistant', content: 'Something went wrong. Please try again.' }]) })
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    sendMessage(input)
  }

  function clearChat() {
    setMessages([])
    setHasInteracted(false)
    try { sessionStorage.removeItem(SESSION_KEY) } catch (e) {}
  }

  function renderMarkdown(text: string) {
    if (!text) return ""
    var html = text
    html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    html = html.replace(/```([\s\S]*?)```/g, function(m, code) {
      return '<pre class="bg-white/10 rounded p-2 my-2 text-xs overflow-x-auto"><code>' + code.trim() + '</code></pre>'
    })
    html = html.replace(/`(.+?)`/g, '<code class="bg-white/10 px-1 rounded text-xs">$1</code>')
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>")
    html = html.replace(/^### (.+)$/gm, '<div class="font-semibold text-sm mt-2 mb-1">$1</div>')
    html = html.replace(/^## (.+)$/gm, '<div class="font-semibold text-sm mt-2 mb-1">$1</div>')
    html = html.replace(/^# (.+)$/gm, '<div class="font-bold text-base mt-2 mb-1">$1</div>')
    html = html.replace(/^---$/gm, '<hr class="border-white/20 my-2" />')
    html = html.replace(/^(\d+)\. (.+)$/gm, '<div class="pl-3"><span class="text-primary-400 mr-1">$1.</span> $2</div>')
    html = html.replace(/^- (.+)$/gm, '<div class="pl-3">\u2022 $1</div>')
    html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-primary-400 underline hover:text-primary-300">$1</a>')
    html = html.replace(/\n\n/g, '</p><p class="mt-2">')
    html = html.replace(/\n/g, "<br />")
    return '<p>' + html + '</p>'
  }

  var panelWidth = isExpanded ? 'w-[calc(100vw-3rem)] sm:w-[560px]' : 'w-[calc(100vw-3rem)] sm:w-96'
  var panelHeight = isExpanded ? 'max-h-[80vh]' : 'max-h-[min(70vh,520px)]'
  var messagesHeight = isExpanded ? 'max-h-[calc(80vh-140px)]' : 'max-h-[340px]'

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={function() { setIsOpen(!isOpen) }}
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-lg shadow-primary-500/20 transition-all duration-300 ${
          isOpen
            ? 'bg-gray-800 text-gray-300 scale-90'
            : 'bg-gradient-to-r from-primary-500 to-purple-500 text-white hover:shadow-xl hover:shadow-primary-500/30 hover:scale-105'
        }`}
        aria-label={isOpen ? 'Close chat' : 'Ask the Unknown'}
      >
        {isOpen ? (
          <X className="w-5 h-5" />
        ) : (
          <>
            <Sparkles className="w-5 h-5" />
            <span className="text-sm font-medium hidden sm:inline">Ask the Unknown</span>
            {messages.length > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary-400 rounded-full animate-pulse" />
            )}
          </>
        )}
      </button>

      {/* Chat Panel */}
      <div
        className={`fixed bottom-20 right-6 z-50 ${panelWidth} transition-all duration-300 origin-bottom-right ${
          isOpen ? 'scale-100 opacity-100 pointer-events-auto' : 'scale-95 opacity-0 pointer-events-none'
        }`}
      >
        <div className={`bg-gray-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col ${panelHeight}`}>
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-primary-500/10 to-purple-500/10 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-primary-500 to-purple-500 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Ask the Unknown</h3>
                <p className="text-xs text-gray-400">AI-powered paranormal research assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors text-xs"
                  title="Clear chat"
                >
                  Clear
                </button>
              )}
              <button
                onClick={function() { setIsExpanded(!isExpanded) }}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                title={isExpanded ? 'Minimize' : 'Expand'}
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${messagesHeight}`} style={{ minHeight: '200px' }}>
            {/* Welcome message */}
            {!hasInteracted && (
              <div className="space-y-3">
                <div className="bg-white/5 rounded-2xl rounded-tl-sm p-3">
                  <p className="text-sm text-gray-300">
                    {context?.type === 'phenomenon'
                      ? `I see you're exploring ${context.name}. I can help you dig deeper into sightings, evidence, and theories. What would you like to know?`
                      : context?.type === 'report'
                      ? 'Interesting report! I can help analyze credibility, find similar cases, or explore possible explanations. What catches your attention?'
                      : 'Welcome! I\'m your AI paranormal research assistant. I have access to over 258,000 reports. Ask me anything about UFOs, cryptids, ghosts, or unexplained phenomena.'}
                  </p>
                </div>
                {/* Suggested questions as cards */}
                <div className="space-y-2">
                  {defaultQuestions.map(function(q, i) {
                    return (
                      <button
                        key={i}
                        onClick={function() { sendMessage(q) }}
                        className="w-full text-left text-sm px-3 py-2.5 rounded-xl bg-primary-500/10 border border-primary-500/20 text-primary-300 hover:bg-primary-500/20 hover:border-primary-500/30 transition-all group flex items-center gap-2"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-primary-400 flex-shrink-0 group-hover:scale-110 transition-transform" />
                        <span>{q}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Chat messages */}
            {messages.map(function(msg, i) {
              return (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl p-3 ${
                      msg.role === 'user'
                        ? 'bg-primary-500/20 text-white rounded-br-sm'
                        : 'bg-white/5 text-gray-300 rounded-tl-sm'
                    }`}
                  >
                    <div className="text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                  </div>
                </div>
              )
            })}

            {/* Typing indicator with animated dots */}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/5 rounded-2xl rounded-tl-sm p-3">
                  <div className="flex items-center gap-2 text-gray-400">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-sm">Researching...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-3 border-t border-white/5">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={function(e) { setInput(e.target.value) }}
                placeholder="Ask anything about the paranormal..."
                className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="p-2.5 rounded-xl bg-primary-500 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-400 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
