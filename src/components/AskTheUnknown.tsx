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
    html = html.replace(/[&/g, "&amp;").replace(/[/g, "&lt;").replace(/\\>/g, "&gt;")
    // Code blocks (triple backtick)o    html = html.replace(/``b([\s\S]*?)```/g, function(m, code) {
      return '<pre class="bg-white/10 rounded p-2 my-2 text-xs overflow-x-auto"><code>' + code.trim() + '</code></pre>'
    })
    // Inline code
    html = html.replace(/`(.+?)`/g, '<code class="bg-white/10 px-1 rounded text-xs">$1</code>')
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    html = html.replace(/\*(.+?)\*/gs, "<em>$1</em>")
    // Headers
    html = html.replace(/^### (.+)$/gm, '<div class="font-semibold text-sm mt-2 mb-1">$1</div>')
    html = html.replace(/^## (.+)$/gm, '<div class="font-semibold text-sm mt-2 mb-1">$1</div>')
    html = html.replace(/^# (.*)$/gm, '<div class="font-bold text-base mt-2 mb-1">$1</div>')
    // Horizontal rule
    html = html.replace(/^---$/gm, '<hr class="border-white/20 my-2" />')
    // Numbered lists
    html = html.replace(/^(\d+)\. (.+)$/gm, '<div class="pl-3"><span class="text-primary-400 mr-1">$1.</span> $2</div>')
    // Bullet lists
    html = html.replace(/^- (.+)$/gm, '<div class="pl-3">â€’ $1</div>')
    // Links â€” keep internal links in-app, only external links open new tab
    html = html.replace(/\[(.+?)\]\((.+?)\)/g, function(_match, text, url) {
      var isInternal = url.startsWith('/') || url.includes('discoverparadocs.com') || url.includes('paradocs.com');
      if (isInternal) {
        var cleanUrl = url.replace(/https?:\/\/(beta\.|www\.)?discoverparadocs\.com/, '').replace(/https?:\/\/(beta\.|www\.)?paradocs\.com/, '');
        return '<a href="' + (cleanUrl || url) + '" class="text-primary-400 underline hover:text-primary-300">' + text + '</a>';
      }
      return '<a href="' + url + '" target="_blank" rel="noopener" class="text-primary-400 underline hover:text-primary-300">' + text + ' <span class="inline-block w-3 h-3 opacity-60">â†‹3/span></a>';
    })
    // Paragraphs (double newline)
    html = html.replace(/\n\n/g, '</p><p class="mt-2">')
    // Single newlines
    html = html.replace(/\n/g, "<br />")
    return '<p>' + html + '</p>'
  }
  Return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-lg shadow-primary-50/20 transition-all duration-300 ${
          isOpen 
            ? 'bg-gray-800 text-gray-300 scale-90' 
            : 'bg-gradient-to-r from-primary-500 to-purple-500 text-white hover:shadow-xl hover:shadow-primary-500/30 hover:scale-105'
        }`}
        aria-label={isOpen ? 'Close chat' : 'Ask the Unknown'}
      >
        {/Be`Öé¹´€ô(€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€½¹±¥¬õì ¤€ôøÍ•Ñ%Í=Á•¸ …¥Í=Á•¸¥ô(€€€€€€€€€±…ÍÍ9…µ”õí±•à¥Ñ•µÌµ•¹Ñ•È…À´ÈÁà´ÐÁä´ÌÉ½Õ¹‘•´Éá°Í¡…‘½Üµ±œÍ¡…‘½ÜµÁÉ¥µ…Éä´ÔÀ¼ÈÀÑÉ…¹Í¥Ñ¥½¸µ…±°‘ÕÉ…Ñ¥½¸´ÌÀÀ½É¥¥¸µ‰½ÑÑ½´µÉ¥¡Ð€‘ì(€€€€€€€€€€€¥Í=Á•¸€(€€€€€€€€€€€€€€ü€‰œµÉ…ä´àÀÀÑ•áÐµÉ…ä´ÌÀÀÍ…±”´äÀœ€(€€€€€€€€€€€€€€è€‰œµÉ…‘¥•¹ÐµÑ¼µÈ™É½´µÁÉ¥µ…Éä´ÔÀÀÑ¼µÁÕÉÁ±”´ÔÀÀÑ•áÐµÝ¡¥Ñ”¡½Ù•ÈéÍ¡…‘½Üµá°¡½Ù•ÈéÍ¡…‘½ÜµÁÉ¥µ…Éä´ÔÀÀ¼ÌÀ¡½Ù•ÈéÍ…±”´ÄÀÔœ(€€€€€€€€€õô(€€€€€€€€€…É¥„µ±…‰•°õí¥Í=Á•¸€ü€±½Í”¡…Ðœ€è€Í¬Ñ¡”U¹­¹½Ý¸ô(€€€€€€€€ø(€€€€€€€€€í¥Í=Á•¸€ü€ (€€€€€€€€€€€€ñ`±…ÍÍ9…µ”ô‰Ü´Ô ´Ôˆ€¼ø(€€€€€€€€€€¤€è€ (€€€€€€€€€€€€ðø(€€€€€€€€€€€€€€ñMÁ…É­±•Ì±…ÍÍ9…µ”ô‰Ü´Ô ´Ôˆ€¼ø(€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áÐµÍ´™½¹Ðµµ•‘¥Õ´¡¥‘‘•¸Í´é¥¹±¥¹”ˆùÍ¬Ñ¡”U¹­¹½Ý¸ð½ÍÁ…¸ø(€€€€€€€€€€€€ð¼ø(€€€€€€€€€€¥ô(€€€€€€€€ð½‰ÕÑÑ½¸ø((€€€€€€€ì¼¨¡…ÐA…¹•°€¨½ô(€€€€€€€€ñ‘¥Ø(€€€€€€€€€±…ÍÍ9…µ”õí¥á•‰½ÑÑ½´´ÈÀÉ¥¡Ð´Øè´ÔÀÜµm…±Œ ÄÀÁÙÜ´ÍÉ•´¥tÍ´éÜ´äØÑÉ…¹Í¥Ñ¥½¸µ…±°‘ÕÉ…Ñ¥½¸´ÌÀÀ½É¥¥¸µ‰½ÑÑ½´µÉ¥¡Ð€‘ì(€€€€€€€€€€€¥Í=Á•¸€ü€Í…±”´ÄÀÀ½Á…¥Ñä´ÄÀÀÁ½¥¹Ñ•Èµ•Ù•¹ÑÌµ…ÕÑ¼œ€è€Í…±”´äÔ½Á…¥Ñä´ÀÁ½¥¹Ñ•Èµ•Ù•¹ÑÌµ¹½¹”œ(€€€€€€€€€õô(€€€€€€€€ø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰‰œµÉ…ä´äÀÀ‰½É‘•È‰½É‘•ÈµÝ¡¥Ñ”¼ÄÀÉ½Õ¹‘•´Éá°Í¡…‘½Ü´Éá°Í¡…‘½Üµ‰±…¬¼ÔÀ½Ù•É™±½Üµ¡¥‘‘•¸™±•à™±•àµ½°ˆÍÑå±”õíìµ…á!•¥¡Ðè€µ¥¸ ÜÁÙ °€ÔÈÁÁà¤œõôø(€€€€€€€€€€€ì¼¨!•…‘•È€¨½ô(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Áà´ÐÁä´Ì‰œµÉ…‘¥•¹ÐµÑ¼µÈ™É½´µÁÉ¥µ…Éä´ÔÀÀ¼ÄÀÑ¼µÁÕÉÁ±”´ÔÀÀ¼ÄÀ‰½É‘•Èµˆ‰½É‘•ÈµÝ¡¥Ñ”¼Ô™±•à¥Ñ•µÌµ•¹Ñ•È…À´Ìˆø(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Ü´à ´àÉ½Õ¹‘•µ™Õ±°‰œµÉ…‘¥•¹ÐµÑ¼µÈ™É½´µÁÉ¥µ…Éä´ÔÀÀÑ¼µÁÕÉÁ±”´ÔÀÀ™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•Èˆø(€€€€€€€€€€€€€€€€ñMÁ…É­±•Ì±…ÍÍ9…µ”ô‰Ü´Ð ´ÐÑ•áÐµÝ¡¥Ñ”ˆ€¼ø(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€€€ñ Ì±…ÍÍ9…µ”ô‰Ñ•áÐµÍ´™½¹ÐµÍ•µ¥‰½±Ñ•áÐµÝ¡¥Ñ”ˆùÍ¬Ñ¡”U¹­¹½Ý¸ð½ Ìø(€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áÐµáÌÑ•áÐµÉ…ä´ÐÀÀˆù$µÁ½Ý•É•Á…É…¹½Éµ…°É•Í•…É …ÍÍ¥ÍÑ…¹Ðð½Àø(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€ð½‘¥Øø((€€€€€€€€€€€ì¼¨5•ÍÍ…•ÌÉ•„€¨½ô(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à´Ä½Ù•É™±½Üµäµ…ÕÑ¼À´ÐÍÁ…”µä´ÐˆÍÑå±”õíìµ¥¹!•¥¡Ðè€œÈÀÁÁàœ°µ…á!•¥¡Ðè€œÌÐÁÁàœõôø(€€€€€€€€€€€€€ì¼¨]•±½µ”µ•ÍÍ…”€¨½ô(€€€€€€€€€€€€€ì…¡…Í%¹Ñ•É…Ñ•€˜˜€ (€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Ìˆø(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰‰œµÝ¡¥Ñ”¼ÔÉ½Õ¹‘•´Éá°É½Õ¹‘•µÑ°µÍ´À´Ìˆø(€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áÐµÍ´Ñ•áÐµÉ…ä´ÌÀÀˆø(€€€€€€€€€€€€€€€€€€€í½¹Ñ•áÐü¹ÑåÁ”€ôôô€Á¡•¹½µ•¹½¸œ€(€€€€€€€€€€€€€€€€€€€€€€ü$Í•”å½ÕpÉ”•áÁ±½É¥¹œ€‘í½¹Ñ•áÐ¹¹…µ•ô¸$…¸¡•±Àå½Ô‘¥œ‘••Á•È¥¹Ñ¼Í¥¡Ñ¥¹Ì°•Ù¥‘•¹”°…¹Ñ¡•½É¥•Ì¸]¡…ÐÝ½Õ±å½Ô±¥­”Ñ¼­¹½Üý€(€€€€€€€€€€€€€€€€€€€€€€è½¹Ñ•áÐü¹ÑåÁ”€ôôô€É•Á½ÉÐœ(€€€€€€€€€€€€€€€€€€€€€€ü€%¹Ñ•É•ÍÑ¥¹œÉ•Á½ÉÐ„$…¸¡•±À…¹…±åé”É•‘¥‰¥±¥Ñä°™¥¹Í¥µ¥±…È…Í•Ì°½È•áÁ±½É”Á½ÍÍ¥‰±”•áÁ±…¹…Ñ¥½¹Ì¸]¡…Ð…Ñ¡•Ìå½ÕÈ…ÑÑ•¹Ñ¥½¸üœ(€€€€€€€€€€€€€€€€€€€€€€è€]•±½µ”„%p´å½ÕÈ$Á…É…¹½Éµ…°É•Í•…É …ÍÍ¥ÍÑ…¹Ð¸$¡…Ù”…•ÍÌÑ¼½Ù•È€ÈÔà°ÀÀÀÉ•Á½ÉÑÌ¸Í¬µ”…¹åÑ¡¥¹œ…‰½ÕÐU=Ì°ÉåÁÑ¥‘Ì°¡½ÍÑÌ°½ÈÕ¹•áÁ±…¥¹•Á¡•¹½µ•¹„¸œ(€€€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€€ð½Àø(€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€(€€€€€€€€€€€€€€€ì¼¨MÕ•ÍÑ•ÅÕ•ÍÑ¥½¹Ì€¨½ô(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Èˆø(€€€€€€€€€€€€€€€€€í‘•™…Õ±ÑEÕ•ÍÑ¥½¹Ì¹µ…À ¡Ä°¤¤€ôø€ (€€€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€€€€€€€­•äõí¥ô(€€€€€€€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøÍ•¹‘5•ÍÍ…”¡Ä¥ô(€€€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰Üµ™Õ±°Ñ•áÐµ±•™ÐÑ•áÐµÍ´Áà´ÌÁä´ÈÉ½Õ¹‘•µá°‰œµÁÉ¥µ…Éä´ÔÀÀ¼ÄÀ‰½É‘•È‰½É‘•ÈµÁÉ¥µ…Éä´ÔÀÀ¼ÈÀÑ•áÐµÁÉ¥µ…Éä´ÌÀÀ¡½Ù•Èé‰œµÁÉ¥µ…Éä´ÔÀÀ¼ÈÀÑÉ…¹Í¥Ñ¥½¸µ½±½ÉÌˆ(€€€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€€íÅô(€€€€€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€¥ô((€€€€€€€€€€€ì¼¨¡…Ðµ•ÍÍ…•Ì€¨½ô(€€€€€€€€€€€íµ•ÍÍ…•Ì¹µ…À ¡µÍœ°¤¤€ôø€ (€€€€€€€€€€€€€€ñ‘¥Ø­•äõí¥ô±…ÍÍ9…µ”õí™±•à€‘íµÍœ¹É½±”€ôôô€ÕÍ•Èœ€ü€©ÕÍÑ¥™äµ•¹œ€è€©ÕÍÑ¥™äµÍÑ…ÉÐõôø(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”õíµ…àµÜµlàÔ•tÉ½Õ¹‘•´Éá°À´Ì€‘ì(€€€€€€€€€€€€€€€€€µÍœ¹É½±”€ôôô€ÕÍ•Èœ(€€€€€€€€€€€€€€€€€€€€ü€‰œµÁÉ¥µ…Éä´ÔÀÀ¼ÈÀÑ•áÐµÝ¡¥Ñ”É½Õ¹‘•µ‰ÈµÍ´œ(€€€€€€€€€€€€€€€€€€€€è€‰œµÝ¡¥Ñ”¼ÔÑ•áÐµÉ…ä´ÌÀÀÉ½Õ¹‘•µÑ°µÍ´œ(€€€€€€€€€€€€€€€õôø(€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Ñ•áÐµÍ´ˆ‘…¹•É½ÕÍ±åM•Ñ%¹¹•É!Q50õíì}}¡Ñµ°èÉ•¹‘•É5…É­‘½Ý¸¡µÍœ¹½¹Ñ•¹Ð¤õô€¼ø(€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€¤¥ô((€€€€€€€€€€€ì¼¨1½…‘¥¹œ¥¹‘¥…Ñ½È€¨½ô(€€€€€€€€€€€í±½…‘¥¹œ€˜˜€ (€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à©ÕÍÑ¥™äµÍÑ…ÉÐˆø(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰‰œµÝ¡¥Ñ”¼ÔÉ½Õ¹‘•´Éá°É½Õ¹‘•µÑ°µÍ´À´Ìˆø(€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´ÈÑ•áÐµÉ…ä´ÐÀÀˆø(€€€€€€€€€€€€€€€€€€€€ñ1½…‘•ÈÈ±…ÍÍ9…µ”ô‰Ü´Ð ´Ð…¹¥µ…Ñ”µÍÁ¥¸ˆ€¼ø(€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áÐµÍ´ˆùI•Í•…É¡¥¹œ¸¸¸ð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€¥ô((€€€€€€€€€€€€ñ‘¥ØÉ•˜õíµ•ÍÍ…•Í¹‘I•™ô€¼ø(€€€€€€€€€€ð½‘¥Øø((€€€€€€€€€ì¼¨%¹ÁÕÐ€¨½ô(€€€€€€€€€€ñ™½É´½¹MÕ‰µ¥Ðõí¡…¹‘±•MÕ‰µ¥Ñô±…ÍÍ9…µ”ô‰À´Ì‰½É‘•ÈµÐ‰½É‘•ÈµÝ¡¥Ñ”¼Ôˆø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´Èˆø(€€€€€€€€€€€€€€ñ¥¹ÁÕÐ(€€€€€€€€€€€€€€€É•˜õí¥¹ÁÕÑI•™ô(€€€€€€€€€€€€€€€ÑåÁ”ô‰Ñ•áÐˆ(€€€€€€€€€€€€€€€Ù…±Õ”õí¥¹ÁÕÑô(€€€€€€€€€€€€€€€½¹¡…¹”õì¡”¤€ôøÍ•Ñ%¹ÁÕÐ¡”¹Ñ…É•Ð¹Ù…±Õ”¥ô(€€€€€€€€€€€€€€€Á±…•¡½±‘•Èô‰Í¬…¹åÑ¡¥¹œ…‰½ÕÐÑ¡”Á…É…¹½Éµ…°¸¸¸ˆ(€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰™±•à´ÄÁà´ÐÁä´È¸Ô‰œµÝ¡¥Ñ”¼Ô‰½É‘•È‰½É‘•ÈµÝ¡¥Ñ”¼ÄÀÉ½Õ¹‘•µá°Ñ•áÐµÝ¡¥Ñ”Ñ•áÐµÍ´Á±…•¡½±‘•ÈµÉ…ä´ÔÀÀ™½ÕÌé½ÕÑ±¥¹”µ¹½¹”™½ÕÌé‰½É‘•ÈµÁÉ¥µ…Éä´ÔÀÀˆ(€€€€€€€€€€€€€€€‘¥Í…‰±•õí±½…‘¥¹ô(€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€ÑåÁ”ô‰ÍÕ‰µ¥Ðˆ(€€€€€€€€€€€€€€€‘¥Í…‰±•õí±½…‘¥¹œñð€…¥¹ÁÕÐ¹ÑÉ¥´ ¥ô(€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰À´È¸ÔÉ½Õ¹‘•µá°‰œµÁÉ¥µ…Éä´ÔÀÀÑ•áÐµÝ¡¥Ñ”‘¥Í…‰±•é½Á…¥Ñä´ÔÀ‘¥Í…‰±•éÕÉÍ½Èµ¹½Ðµ…±±½Ý•¡½Ù•Èé‰œµÁÉ¥µ…Éä´ÐÀÀÑÉ…¹Í¥Ñ¥½¸µ½±½ÉÌˆ(€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€ñM•¹±…ÍÍ9…µ”ô‰Ü´Ð ´Ðˆ€¼ø(€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ð½™½É´ø(€€€€€€€€ð½‘¥Øø(€€€€€€ð½‘¥Øø(€€€€ð¼ø(€€¤)ô(