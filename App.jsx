import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, Bot, ChevronDown, CircleHelp, Cpu, Menu, MessageSquarePlus,
  MoreHorizontal, Paperclip, Plus, Send, Settings2, ShieldCheck, Sparkles,
  SquarePen, Trash2, User, WandSparkles, X
} from "lucide-react";

const starterPrompts = [
  { icon: "✦", title: "Brainstorm ideas", text: "Help me brainstorm creative ideas for a new project." },
  { icon: "⌘", title: "Write some code", text: "Help me build a small web app and explain the code." },
  { icon: "↗", title: "Learn something", text: "Teach me something fascinating in a simple way." }
];

function readChats() {
  try { return JSON.parse(localStorage.getItem("kiko-chats") || "[]"); } catch { return []; }
}
function makeChat() {
  return { id: crypto.randomUUID(), title: "New conversation", messages: [], updatedAt: Date.now() };
}

export default function App() {
  const [chats, setChats] = useState(readChats);
  const [activeId, setActiveId] = useState(() => readChats()[0]?.id || null);
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState("openai");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(() => localStorage.getItem("kiko-personality") || "");
  const [error, setError] = useState("");
  const bottomRef = useRef(null);
  const abortRef = useRef(null);

  const activeChat = chats.find(c => c.id === activeId) || null;
  const messages = activeChat?.messages || [];
  const selectedProvider = providers.find(p => p.id === provider);

  useEffect(() => {
    fetch("/api/providers").then(r => r.json()).then(data => {
      setProviders(data.providers || []);
      if (data.defaultProvider) setProvider(data.defaultProvider);
    }).catch(() => setError("Can't reach KIKO's server. Start the app with npm run dev."));
  }, []);

  useEffect(() => { localStorage.setItem("kiko-chats", JSON.stringify(chats)); }, [chats]);
  useEffect(() => { localStorage.setItem("kiko-personality", systemPrompt); }, [systemPrompt]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  function newChat() {
    const chat = makeChat();
    setChats(prev => [chat, ...prev]);
    setActiveId(chat.id);
    setInput("");
    setError("");
    setSidebarOpen(false);
  }

  function updateMessages(id, next) {
    setChats(prev => prev.map(c => c.id === id ? { ...c, messages: next, updatedAt: Date.now() } : c));
  }

  async function sendMessage(text = input) {
    const content = text.trim();
    if (!content || busy) return;
    let chat = activeChat;
    if (!chat) {
      chat = makeChat();
      setChats(prev => [chat, ...prev]);
      setActiveId(chat.id);
    }
    const next = [...chat.messages, { role: "user", content }, { role: "assistant", content: "" }];
    const title = chat.messages.length ? chat.title : content.slice(0, 36) + (content.length > 36 ? "…" : "");
    setChats(prev => {
      const exists = prev.some(c => c.id === chat.id);
      const updated = { ...chat, title, messages: next, updatedAt: Date.now() };
      return exists ? prev.map(c => c.id === chat.id ? updated : c) : [updated, ...prev];
    });
    setInput("");
    setBusy(true);
    setError("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          provider,
          messages: next.slice(0, -1),
          systemPrompt
        })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${response.status})`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const event of events) {
          const line = event.split("\n").find(l => l.startsWith("data:"));
          if (!line) continue;
          const raw = line.slice(5).trim();
          if (raw === "[DONE]") continue;
          try {
            const data = JSON.parse(raw);
            if (data.token) {
              setChats(prev => prev.map(c => {
                if (c.id !== chat.id) return c;
                const msgs = [...c.messages];
                const last = { ...msgs[msgs.length - 1], content: msgs[msgs.length - 1].content + data.token };
                msgs[msgs.length - 1] = last;
                return { ...c, messages: msgs };
              }));
            }
          } catch { /* Ignore malformed event. */ }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message);
        setChats(prev => prev.map(c => {
          if (c.id !== chat.id) return c;
          const msgs = [...c.messages];
          const last = msgs[msgs.length - 1];
          if (last?.role === "assistant" && !last.content) msgs.pop();
          return { ...c, messages: msgs };
        }));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function deleteChat(id, event) {
    event?.stopPropagation();
    const next = chats.filter(c => c.id !== id);
    setChats(next);
    if (activeId === id) setActiveId(next[0]?.id || null);
  }

  const groupedChats = useMemo(() => chats, [chats]);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark"><Bot size={21} /></div>
          <div><div className="brand-name">KIKO<span>.</span></div><div className="brand-sub">PERSONAL AI SPACE</div></div>
          <button className="icon-btn mobile-close" onClick={() => setSidebarOpen(false)}><X size={18}/></button>
        </div>
        <button className="new-chat-btn" onClick={newChat}><Plus size={17}/> New chat <span>⌘ K</span></button>
        <div className="side-label">WORKSPACE</div>
        <div className="nav-item active"><MessageSquarePlus size={16}/> Conversations</div>
        <div className="nav-item" onClick={() => setSettingsOpen(true)}><Settings2 size={16}/> Personalization</div>
        <div className="history-head"><span className="side-label">RECENT CHATS</span><MoreHorizontal size={17}/></div>
        <div className="chat-list">
          {groupedChats.map(chat => (
            <div className={`chat-history-item ${chat.id === activeId ? "selected" : ""}`} key={chat.id} onClick={() => {setActiveId(chat.id);setSidebarOpen(false);}}>
              <MessageSquarePlus size={15}/><span>{chat.title}</span>
              <button aria-label="Delete conversation" onClick={e => deleteChat(chat.id,e)}><Trash2 size={14}/></button>
            </div>
          ))}
          {!chats.length && <div className="empty-history">Your conversations will appear here.</div>}
        </div>
        <div className="sidebar-bottom">
          <div className="profile-card">
            <div className="avatar user-avatar"><User size={17}/></div>
            <div className="profile-copy"><strong>Your workspace</strong><span>Personal account</span></div>
            <button className="icon-btn" onClick={() => setSettingsOpen(true)}><Settings2 size={17}/></button>
          </div>
          <div className="privacy-note"><ShieldCheck size={13}/> API keys stay on your server</div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="top-left">
            <button className="icon-btn menu-btn" onClick={() => setSidebarOpen(true)}><Menu size={19}/></button>
            <div className="crumb">Workspace <span>/</span> <b>{activeChat?.title || "New conversation"}</b></div>
          </div>
          <div className="top-actions">
            <div className="model-wrap">
              <Cpu size={15}/>
              <select value={provider} onChange={e => setProvider(e.target.value)} aria-label="AI provider">
                {providers.map(p => <option key={p.id} value={p.id}>{p.label}{p.configured ? "" : " · setup needed"}</option>)}
                {!providers.length && <option value="openai">Loading models…</option>}
              </select>
              <ChevronDown size={14}/>
            </div>
            <button className="icon-btn" title="Personalize KIKO" onClick={() => setSettingsOpen(true)}><Settings2 size={18}/></button>
          </div>
        </header>

        <section className={`conversation ${messages.length ? "has-messages" : ""}`}>
          {!messages.length ? (
            <div className="welcome">
              <div className="orb-wrap"><div className="orb"><Sparkles size={27}/></div><div className="orb-ring ring-one"/><div className="orb-ring ring-two"/></div>
              <div className="eyebrow"><span/> YOUR AI, YOUR SPACE</div>
              <h1>Hey there, I'm <span>KIKO.</span></h1>
              <p className="welcome-sub">A little curiosity can take you a long way.<br/>What would you like to explore today?</p>
              <div className="suggestion-grid">
                {starterPrompts.map(item => <button className="suggestion-card" key={item.title} onClick={() => sendMessage(item.text)}><span className="suggestion-icon">{item.icon}</span><strong>{item.title}</strong><span>{item.text}</span><span className="card-arrow">↗</span></button>)}
              </div>
            </div>
          ) : (
            <div className="message-feed">
              {messages.map((m,i) => <div className={`message-row ${m.role}`} key={i}>
                <div className={`message-avatar ${m.role === "assistant" ? "kiko-avatar" : ""}`}>{m.role === "assistant" ? <Bot size={17}/> : <User size={16}/>}</div>
                <div className="message-body"><div className="message-author">{m.role === "assistant" ? "KIKO" : "YOU"} {m.role === "assistant" && <span>· {selectedProvider?.label || provider}</span>}</div><div className="message-text">{m.content || (busy && i === messages.length - 1 ? <span className="typing"><i/><i/><i/></span> : "")}</div></div>
              </div>)}
              <div ref={bottomRef}/>
            </div>
          )}
          {error && <div className="error-banner"><CircleHelp size={16}/>{error}</div>}
        </section>

        <footer className="composer-area">
          <div className="composer">
            <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => {if(e.key === "Enter" && !e.shiftKey){e.preventDefault();sendMessage();}}} placeholder="Message KIKO..." rows={1}/>
            <div className="composer-tools">
              <div className="composer-hints"><span><WandSparkles size={14}/> Ask anything</span><span className="hint-separator">·</span><span>Shift + Enter for new line</span></div>
              <div className="composer-actions">
                <button className="attach-btn" title="File uploads coming soon"><Paperclip size={17}/></button>
                {busy ? <button className="send-btn stop-btn" onClick={() => abortRef.current?.abort()}><span/> Stop</button> : <button className="send-btn" onClick={() => sendMessage()} disabled={!input.trim()}><Send size={15}/></button>}
              </div>
            </div>
          </div>
          <div className="disclaimer">KIKO can make mistakes. Check important information. <span>·</span> Powered by your selected model.</div>
        </footer>
      </main>

      {settingsOpen && <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
        <div className="settings-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-head"><div><div className="modal-kicker">MAKE IT YOURS</div><h2>KIKO's personality</h2></div><button className="icon-btn" onClick={() => setSettingsOpen(false)}><X size={19}/></button></div>
          <p>Set extra instructions for how KIKO should respond. These are sent with each conversation.</p>
          <label htmlFor="personality">Custom instructions</label>
          <textarea id="personality" className="personality-input" value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} placeholder="Example: Be upbeat, concise, curious, and use simple language."/>
          <div className="modal-foot"><span>Saved in this browser</span><button className="save-btn" onClick={() => setSettingsOpen(false)}>Save preferences</button></div>
        </div>
      </div>}
    </div>
  );
}
