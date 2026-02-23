import React, { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Sparkles, Loader2, ChevronDown } from 'lucide-react'

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

export default function AskTheUnknown({ context, suggestedQuestions }: AskTheUnknownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasInteracted, setHasInteracted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const defaultQuestions = suggestedQuestions || getDefaultQuestions(context)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300)
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
      `What\'s the best evidence for ${ctx.name}?`,
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
    const userMsg: ChatMessage = { role: 'user', content: text.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          context,
          history: messages.slice(-6)
        })
      })

      if (res.ok) {
        const data = await res.json()
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      } else {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: 'I\'m having trouble connecting right now. Please try again in a moment.' 
        }])
      }
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Something went wrong. Please try again.' 
      }])
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    sendMessage(input)
  }

  function renderMarkdown(text) {
    if (!text) return ""
    var html = text
    // Escape HTML
    html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // Code blocks (triple backtick)
    html = html.replace(/```([\s\S]*?)```/g, function(m, code) {
      return '<pre class="bg-white/10 rounded p-2 my-2 text-xs overflow-x-auto"><code>' + code.trim() + '</code></pre>'
    })
    // Inline code
    html = html.replace(/`(.+?)`/g, '<code class="bg-white/10 px-1 rounded text-xs">$1</code>')
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Headers
    html = html.replace(/^### (.+)$/gm, '<div class="font-semibold text-sm mt-2 mb-1">$1</div>')
    html = html.replace(/^## (.+)$/gm, '<div class="font-semibold text-sm mt-2 mb-1">$1</div>')
    html = html.replace(/^# (.+)$/gm, '<div class="font-bold text-base mt-2 mb-1">$1</div>')
    // Horizontal rule
    html = html.replace(/^---$/gm, '<hr class="border-white/20 my-2" />')
    // Numbered lists
    html = html.replace(/^(\d+)\. (.+)$/gm, '<div class="pl-3"><span class="text-primary-400 mr-1">$1.</span> $2</div>')
    // Bullet lists
    html = html.replace(/^- (.+)$/gm, '<div class="pl-3">\u2022 $1</div>')
    // Links — keep internal links in-app, only external links open new tab
    html = html.replace(/\[(.+?)\]\((.+?)\)/g, function(_match, text, url) {
      var isInternal = url.startsWith('/') || url.includes('discoverparadocs.com') || url.includes('paradocs.com');
      if (isInternal) {
        var cleanUrl = url.replace(/https?:\/\/(beta\.|www\.)?discoverparadocs\.com/, '').replace(/https?:\/\/(beta\.|www\.)?paradocs\.com/, '');
        return '<a href="' + (cleanUrl || url) + '" class="text-primary-400 underline hover:text-primary-300">' + text + '</a>';
      }
      return '<a href="' + url + '" target="_blank" rel="noopener" class="text-primary-400 underline hover:text-primary-300">' + text + ' <span class="inline-block w-3 h-3 opacity-60">↗</span></a>';
    })
    // Paragraphs (double newline)
    html = html.replace(/\n\n/g, '</p><p class="mt-2">')
    // Single newlines
    html = html.replace(/\n/g, "<br />")
    return '<p>' + html + '</p>'
  }
  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
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
          </>
        )}
      </button>

      {/* Chat Panel */}
      <div
        className={`fixed bottom-20 right-6 z-50 w-[calc(100vw-3rem)] sm:w-96 transition-all duration-300 origin-bottom-right ${
          isOpen ? 'scale-100 opacity-100 pointer-events-auto' : 'scale-95 opacity-0 pointer-events-none'
        }`}
      >
        <div className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col" style={{ maxHeight: 'min(70vh, 520px)' }}>
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-primary-500/10 to-purple-500/10 border-b border-white/5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-primary-500 to-purple-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Ask the Unknown</h3>
              <p className="text-xs text-gray-400">AI-powered paranormal research assistant</p>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ minHeight: '200px', maxHeight: '340px' }}>
            {/* Welcome message */}
            {!hasInteracted && (
              <div className="space-y-3">
                <div className="bg-white/5 rounded-2xl rounded-tl-sm p-3">
                  <p className="text-sm text-gray-300">
                    {context?.type === 'phenomenon' 
                      ? `I see you\'re exploring ${context.name}. I can help you dig deeper into sightings, evidence, and theories. What would you like to know?`
                      : context?.type === 'report'
                      ? 'Interesting report! I can help analyze credibility, find similar cases, or explore possible explanations. What catches your attention?'
                      : 'Welcome! I\'m your AI paranormal research assistant. I have access to over 258,000 reports. Ask me anything about UFOs, cryptids, ghosts, or unexplained phenomena.'
                    }
                  </p>
                </div>
                
                {/* Suggested questions */}
                <div className="space-y-2">
                  {defaultQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(q)}
                      className="w-full text-left text-sm px-3 py-2 rounded-xl bg-primary-500/10 border border-primary-500/20 text-primary-300 hover:bg-primary-500/20 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Chat messages */}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 ${
                  msg.role === 'user'
                    ? 'bg-primary-500/20 text-white rounded-br-sm'
                    : 'bg-white/5 text-gray-300 rounded-tl-sm'
                }`}>
                  <div className="text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/5 rounded-2xl rounded-tl-sm p-3">
                  <div className="flex items-center gap-2 text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
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
                onChange={(e) => setInput(e.target.value)}
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