
import React, { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'

const TERM_TABS = ['Terminal', 'Output', 'Problems', 'Debug Console']

export default function Terminal() {
  const { terminalOutput, addTerminalLine } = useStore()
  const [activeTermTab, setActiveTermTab] = useState('Terminal')
  const [input, setInput] = useState('')
  const bodyRef = useRef(null)

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [terminalOutput])

  const handleCmd = (e) => {
    if (e.key === 'Enter' && input.trim()) {
      addTerminalLine({ type: 'prompt', text: '~/rejection-mapper  feat/ai-suggestions' })
      addTerminalLine({ type: 'cmd', text: '$ ' + input })
      setInput('')
      setTimeout(() => {
        addTerminalLine({ type: 'success', text: '  ✓ Done' })
      }, 400)
    }
  }

  const typeColors = {
    prompt: 'var(--acc2)',
    cmd: 'var(--text1)',
    info: 'var(--blue2)',
    success: 'var(--green2)',
    warn: 'var(--amber)',
    err: '#fca5a5',
    out: 'var(--muted)',
  }

  return (
    <div style={{
      height: 180, background: '#080810', borderTop: '1px solid var(--line)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--bg1)', borderBottom: '1px solid var(--line)',
        height: 30, paddingLeft: 6, flexShrink: 0,
      }}>
        {TERM_TABS.map(t => (
          <button key={t} onClick={() => setActiveTermTab(t)}
            style={{
              background: 'transparent', border: 'none',
              color: activeTermTab === t ? 'var(--text1)' : 'var(--muted)',
              padding: '0 11px', height: '100%', fontSize: 12,
              borderBottom: activeTermTab === t ? '2px solid var(--blue)' : '2px solid transparent',
              transition: 'all .1s',
            }}
            onMouseEnter={e => { if (activeTermTab !== t) e.currentTarget.style.color = 'var(--text2)' }}
            onMouseLeave={e => { if (activeTermTab !== t) e.currentTarget.style.color = 'var(--muted)' }}
          >
            {t}
            {t === 'Problems' && (
              <span style={{ background: 'var(--blue-dim)', color: 'var(--blue2)', borderRadius: 3, padding: '0 4px', fontSize: 9, marginLeft: 4 }}>2</span>
            )}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, paddingRight: 10 }}>
          <button style={{ background: 'transparent', border: 'none', color: 'var(--muted)', padding: '3px 6px', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>+</button>
          <button style={{ background: 'transparent', border: 'none', color: 'var(--muted)', padding: '3px 6px', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>✕</button>
        </div>
      </div>

      {/* Body */}
      <div ref={bodyRef} style={{ flex: 1, padding: '7px 14px 4px', overflowY: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.7 }}>
        {terminalOutput.map((line, i) => (
          <div key={i} style={{ color: typeColors[line.type] || 'var(--text2)', whiteSpace: 'pre' }}>
            {line.text}
          </div>
        ))}
        {/* Input line */}
        <div style={{ display: 'flex', alignItems: 'center', color: 'var(--acc2)', marginTop: 2 }}>
          <span style={{ marginRight: 6 }}>▶</span>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleCmd}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text1)',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 12, outline: 'none', flex: 1,
            }}
            placeholder=""
          />
          <span style={{ animation: 'blink 1s step-end infinite', color: 'var(--text2)' }}>_</span>
        </div>
      </div>
    </div>
  )
}
