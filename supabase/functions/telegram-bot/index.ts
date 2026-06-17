import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
    })
  }

  const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(SUPABASE_URL, SERVICE_KEY)

  console.log('BOT_TOKEN set:', !!BOT_TOKEN)
  console.log('SUPABASE_URL set:', !!SUPABASE_URL)
  console.log('SERVICE_KEY set:', !!SERVICE_KEY)

  async function reply(chatId: number, text: string) {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
    const data = await res.json()
    console.log('Telegram reply result:', JSON.stringify(data))
  }

  try {
    const body = await req.json()
    console.log('Received body:', JSON.stringify(body))
    const message = body?.message
    if (!message) return new Response('ok', { status: 200 })

    const chatId = message.chat.id
    const text = (message.text || '').trim()

    if (!text) {
      await reply(chatId, 'Send me any text and I will save it to your brain.')
      return new Response('ok', { status: 200 })
    }

    if (text === '/start' || text === '/help') {
      await reply(chatId, '🧠 Open Brain Bot\n\nSend any message to save it.\n\n/search keyword — search your thoughts\n?keyword — same as /search\n/recent — see your last 5 thoughts')
      return new Response('ok', { status: 200 })
    }

    if (text === '/recent') {
      const { data } = await db.from('thoughts').select('content, created_at').order('created_at', { ascending: false }).limit(5)
      if (!data || data.length === 0) {
        await reply(chatId, 'No thoughts saved yet.')
      } else {
        const out = data.map((t, i) => `${i + 1}. ${t.content.slice(0, 250)}${t.content.length > 250 ? '…' : ''}`).join('\n\n')
        await reply(chatId, `🕐 Your last ${data.length} thoughts:\n\n${out}`)
      }
      return new Response('ok', { status: 200 })
    }

    if (text.startsWith('/search ') || text.startsWith('?')) {
      const query = text.startsWith('/search ') ? text.slice(8).trim() : text.slice(1).trim()
      if (!query) { await reply(chatId, 'Usage: /search keyword'); return new Response('ok', { status: 200 }) }
      const { data } = await db.from('thoughts').select('content').ilike('content', `%${query}%`).order('created_at', { ascending: false }).limit(5)
      if (!data || data.length === 0) {
        await reply(chatId, `No results for "${query}"`)
      } else {
        const out = data.map((t, i) => `${i + 1}. ${t.content.slice(0, 250)}${t.content.length > 250 ? '…' : ''}`).join('\n\n')
        await reply(chatId, `🔍 ${data.length} results for "${query}":\n\n${out}`)
      }
      return new Response('ok', { status: 200 })
    }

    const { error } = await db.from('thoughts').insert({ content: text })
    await reply(chatId, error ? 'Error saving. Try again.' : '✓ Saved to your brain.')

  } catch (e) {
    console.error(e)
  }

  return new Response('ok', { status: 200 })
})
