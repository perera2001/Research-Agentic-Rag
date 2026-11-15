import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, BookOpenText, Check, ChevronDown, CircleHelp, Clock3,
  FilePlus2, FileText, FolderOpen, LayoutDashboard, LogOut, Menu,
  MessageCircle, Plus, RefreshCw, Send, Sparkles, Trash2, UploadCloud, UsersRound, X,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import Brand from '../components/Brand';
import StatusPill from '../components/StatusPill';
import SummaryContent from '../components/SummaryContent';
import { useAuth } from '../context/AuthContext';
import UsersPage from './UsersPage';

const NAV = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'documents', label: 'My documents', icon: FolderOpen },
  { key: 'chat', label: 'Research chat', icon: MessageCircle },
  { key: 'summaries', label: 'Summaries', icon: BookOpenText },
];
const ADMIN_NAV = { key: 'users', label: 'Users', icon: UsersRound };

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

async function fileSha256(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function EmptyState({ icon: Icon, title, description, action }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={27} /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}

function DocumentCard({ document, onDelete }) {
  const busy = document.status === 'processing' || document.summaryStatus === 'processing';
  return (
    <article className="document-card">
      <div className="document-main">
        <span className="document-icon"><FileText size={23} /></span>
        <div className="document-identity"><h3 title={document.fileName}>{document.fileName}</h3><p>Uploaded {formatDate(document.uploadedAt)} · {document.pageCount || 0} pages · {document.chunkCount || 0} chunks</p></div>
        <div className="document-statuses"><span>Index <StatusPill status={document.status} /></span><span>Summary <StatusPill status={document.summaryStatus} /></span></div>
        <button className="icon-button delete-button" type="button" title={busy ? 'Processing must finish before deletion' : 'Delete document'} onClick={() => onDelete(document)} disabled={busy}><Trash2 size={18} /></button>
      </div>
      {(document.processingError || document.summaryError) && <div className="document-errors">{document.processingError && <p>Indexing: {document.processingError}</p>}{document.summaryError && <p>Summary: {document.summaryError}</p>}</div>}
      {document.summary && <details className="document-summary"><summary>View structured summary <ChevronDown size={17} /></summary><SummaryContent summary={document.summary} /></details>}
    </article>
  );
}

export default function Workspace() {
  const { token, user, signOut } = useAuth();
  const [page, setPage] = useState('overview');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadFingerprint, setUploadFingerprint] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const fileSelectionRef = useRef(0);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingSession, setLoadingSession] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef(null);

  const readyDocuments = useMemo(() => documents.filter((document) => document.status === 'ready'), [documents]);
  const processing = documents.some((document) => ['uploaded', 'processing'].includes(document.status) || ['pending', 'processing'].includes(document.summaryStatus));

  useEffect(() => {
    const readyIds = new Set(readyDocuments.map((document) => document.id));
    setSelectedDocumentId((current) => (
      readyIds.has(current) ? current : readyDocuments.length === 1 ? readyDocuments[0].id : null
    ));
  }, [readyDocuments]);

  const loadDocuments = useCallback(async () => {
    const data = await apiRequest('/api/documents', { token });
    setDocuments(data.documents || []);
  }, [token]);
  const loadSummaries = useCallback(async () => {
    const data = await apiRequest('/api/documents/summaries', { token });
    setSummaries(data.summaries || []);
  }, [token]);
  const loadSessions = useCallback(async () => {
    const data = await apiRequest('/api/chat/sessions', { token });
    setSessions(data.sessions || []);
  }, [token]);

  useEffect(() => {
    Promise.allSettled([loadDocuments(), loadSummaries(), loadSessions()])
      .then((results) => {
        const failed = results.find((result) => result.status === 'rejected');
        if (failed) setError(failed.reason?.message || 'Could not load your workspace.');
      })
      .finally(() => setLoading(false));
  }, [loadDocuments, loadSummaries, loadSessions]);

  useEffect(() => {
    if (!processing) return undefined;
    const interval = setInterval(() => {
      loadDocuments().catch(() => {});
      loadSummaries().catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [processing, loadDocuments, loadSummaries]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  function navigate(next) { setPage(next); setMobileMenu(false); setError(''); }
  function flash(message) { setNotice(message); setTimeout(() => setNotice(''), 4500); }

  async function refreshAll() {
    setError('');
    try { await Promise.all([loadDocuments(), loadSummaries(), loadSessions()]); }
    catch (requestError) { setError(requestError.message); }
  }

  function selectFile(file) {
    if (!file) return;
    const selection = ++fileSelectionRef.current;
    if (!file.name.toLowerCase().endsWith('.pdf') || (file.type && file.type !== 'application/pdf')) {
      setError('Please choose a PDF file.'); return;
    }
    if (file.size > 25 * 1024 * 1024) { setError('PDF files must be 25 MB or smaller.'); return; }
    setError(''); setUploadFile(file); setUploadFingerprint('');
    fileSha256(file)
      .then((fingerprint) => {
        if (selection === fileSelectionRef.current) setUploadFingerprint(fingerprint);
      })
      .catch(() => {
        if (selection === fileSelectionRef.current) setError('Could not read the selected PDF. Please choose it again.');
      });
  }

  async function uploadDocument(event) {
    event.preventDefault();
    if (!uploadFile) return;
    setUploading(true); setError('');
    try {
      const fingerprint = await fileSha256(uploadFile);
      const form = new FormData();
      form.append('file', uploadFile);
      const data = await apiRequest('/api/documents/upload', {
        method: 'POST', token, body: form,
        extraHeaders: { 'X-File-SHA256': fingerprint },
      });
      setDocuments((current) => [data.document, ...current.filter((item) => item.id !== data.document.id)]);
      setUploadFile(null);
      setUploadFingerprint('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      flash('PDF uploaded. Indexing and summary generation have started.');
      await loadDocuments();
    } catch (requestError) { setError(requestError.message); }
    finally { setUploading(false); }
  }

  async function deleteDocument(document) {
    if (!window.confirm(`Delete “${document.fileName}” and its saved summary?`)) return;
    setError('');
    try {
      await apiRequest(`/api/documents/${document.id}`, { method: 'DELETE', token });
      setSelectedDocumentId((current) => current === document.id ? null : current);
      await Promise.all([loadDocuments(), loadSummaries()]);
      flash('Document deleted.');
    } catch (requestError) { setError(requestError.message); }
  }

  async function deleteSummary(id) {
    if (!window.confirm('Delete this saved summary?')) return;
    setError('');
    try {
      await apiRequest(`/api/documents/summaries/${id}`, { method: 'DELETE', token });
      await loadSummaries();
      flash('Saved summary deleted.');
    } catch (requestError) { setError(requestError.message); }
  }

  async function deleteAccount() {
    if (!window.confirm('Permanently delete your account, documents, chats, and summaries? This cannot be undone.')) return;
    setDeletingAccount(true);
    setError('');
    try {
      await apiRequest('/api/users/me', { method: 'DELETE', token });
      signOut();
    } catch (requestError) {
      setError(requestError.message);
      setMobileMenu(false);
    } finally {
      setDeletingAccount(false);
    }
  }

  function newChat() {
    setActiveSessionId(null);
    setMessages([]);
    setQuestion('');
    setSelectedDocumentId(readyDocuments.length === 1 ? readyDocuments[0].id : null);
    navigate('chat');
  }

  function choosePaper(documentId) {
    if (documentId !== selectedDocumentId && activeSessionId !== null) {
      setActiveSessionId(null);
      setMessages([]);
      setQuestion('');
    }
    setSelectedDocumentId(documentId);
    setError('');
  }

  async function openSession(id) {
    setLoadingSession(true); setError(''); navigate('chat');
    try {
      const data = await apiRequest(`/api/chat/sessions/${id}`, { token });
      setActiveSessionId(id);
      setMessages((data.messages || []).filter((message) => message.role === 'user' || message.role === 'assistant'));
      const lastSource = [...(data.messages || [])].reverse().find((message) => message.sources?.length)?.sources?.[0];
      setSelectedDocumentId(
        readyDocuments.some((document) => document.id === lastSource?.document_id)
          ? lastSource.document_id
          : readyDocuments.length === 1 ? readyDocuments[0].id : null,
      );
    } catch (requestError) { setError(requestError.message); }
    finally { setLoadingSession(false); }
  }

  async function deleteSession(id) {
    if (!window.confirm('Delete this chat and its messages?')) return;
    setError('');
    try {
      await apiRequest(`/api/chat/sessions/${id}`, { method: 'DELETE', token });
      if (activeSessionId === id) newChat();
      await loadSessions();
      flash('Chat session deleted.');
    } catch (requestError) { setError(requestError.message); }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = question.trim();
    if (!text || sending) return;
    if (!selectedDocumentId) {
      setError('Select one ready research paper before asking a question.');
      return;
    }
    const pendingMessageId = `user-${Date.now()}-${Math.random()}`;
    setMessages((current) => [...current,
      { id: pendingMessageId, role: 'user', content: text, sources: [] },
    ]);
    setQuestion('');
    setSending(true); setError('');
    try {
      const data = await apiRequest('/api/chat', {
        method: 'POST', token,
        body: { question: text, session_id: activeSessionId, document_ids: [selectedDocumentId] },
      });
      setMessages((current) => [...current,
        { id: `assistant-${Date.now()}`, role: 'assistant', content: data.answer, sources: data.sources || [] },
      ]);
      setActiveSessionId(data.session_id);
      loadSessions().catch((requestError) => setError(requestError.message));
    } catch (requestError) {
      setMessages((current) => current.filter((message) => message.id !== pendingMessageId));
      setQuestion((current) => current || text);
      setError(requestError.message);
    }
    finally { setSending(false); }
  }

  const welcomeName = user?.name?.split(' ')[0] || 'Researcher';
  const navItems = user?.role === 'admin' ? [...NAV, ADMIN_NAV] : NAV;

  return (
    <div className="workspace">
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <div className="sidebar-top"><Brand /><button className="mobile-close icon-button" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={20} /></button></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Main navigation">{navItems.map(({ key, label, icon: Icon }) => <button key={key} type="button" className={`nav-item ${page === key ? 'active' : ''}`} onClick={() => navigate(key)}><Icon size={19} /><span>{label}</span>{page === key && <span className="nav-indicator" />}</button>)}</nav>
        <div className="sidebar-bottom"><div className="sidebar-tip"><span><Sparkles size={18} /></span><strong>Make every paper count.</strong><p>Upload research, discover insights, and keep the conversation going.</p></div>{user?.role === 'user' && <button className="sidebar-delete-account" type="button" onClick={deleteAccount} disabled={deletingAccount}><Trash2 size={16} />{deletingAccount ? 'Deleting account…' : 'Delete account'}</button>}<div className="sidebar-user"><div className="avatar">{(user?.name || 'R').slice(0, 1).toUpperCase()}</div><div className="sidebar-user-details"><strong>{user?.name}</strong><span>{user?.email}</span></div><button className="icon-button" onClick={signOut} title="Sign out" aria-label="Sign out"><LogOut size={18} /></button></div></div>
      </aside>
      {mobileMenu && <button className="mobile-overlay" onClick={() => setMobileMenu(false)} aria-label="Close menu" />}

      <div className="main-area">
        <header className="topbar"><div className="topbar-left"><button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu size={22} /></button><span className="breadcrumb">Workspace <span>/</span> {navItems.find((item) => item.key === page)?.label}</span></div><div className="topbar-right"><span className="topbar-date">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>{page !== 'users' && <button className="icon-button refresh-button" title="Refresh data" onClick={refreshAll}><RefreshCw size={18} /></button>}</div></header>
        <main className="main-content">
          {error && <div className="alert alert-error" role="alert"><CircleHelp size={18} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X size={17} /></button></div>}
          {notice && <div className="alert alert-success" role="status"><Check size={18} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={17} /></button></div>}
          {loading ? <div className="page-loading"><RefreshCw size={25} className="spin" />Loading your workspace…</div> : <>
            {page === 'users' && user?.role === 'admin' && <UsersPage token={token} currentUserId={user.id} />}
            {page === 'overview' && <>
              <PageHeading eyebrow="YOUR RESEARCH HUB" title={`Good to see you, ${welcomeName}.`} description="A clear view of your papers, conversations, and fresh insights." action={<button className="button button-primary" onClick={() => navigate('documents')}><Plus size={18} /> Upload a paper</button>} />
              <div className="stats-grid"><div className="stat-card"><span className="stat-icon stat-icon-mint"><FolderOpen size={23} /></span><span className="stat-number">{documents.length}</span><span className="stat-label">Total documents</span><span className="stat-foot">Your research library</span></div><div className="stat-card"><span className="stat-icon stat-icon-blue"><Check size={23} /></span><span className="stat-number">{readyDocuments.length}</span><span className="stat-label">Ready to explore</span><span className="stat-foot">Indexed and searchable</span></div><div className="stat-card"><span className="stat-icon stat-icon-violet"><MessageCircle size={23} /></span><span className="stat-number">{sessions.length}</span><span className="stat-label">Conversations</span><span className="stat-foot">Questions worth asking</span></div><div className="stat-card"><span className="stat-icon stat-icon-orange"><BookOpenText size={23} /></span><span className="stat-number">{summaries.length}</span><span className="stat-label">Recent summaries</span><span className="stat-foot">Key ideas at a glance</span></div></div>
              <div className="overview-grid"><section className="panel recent-panel"><div className="panel-head"><div><div className="eyebrow">YOUR LIBRARY</div><h2>Recent documents</h2></div><button className="text-link" onClick={() => navigate('documents')}>View all <ArrowRight size={16} /></button></div>{documents.length ? <div className="recent-list">{documents.slice(0, 4).map((document) => <div className="recent-item" key={document.id}><span className="recent-file-icon"><FileText size={20} /></span><div><strong>{document.fileName}</strong><span>{formatDate(document.uploadedAt)}</span></div><StatusPill status={document.status} /></div>)}</div> : <EmptyState icon={FolderOpen} title="Your library starts here" description="Upload a PDF to create your first searchable paper." action={<button className="button button-soft" onClick={() => navigate('documents')}>Upload a PDF <ArrowRight size={16} /></button>} />}</section></div>
            </>}

            {page === 'documents' && <>
              <PageHeading eyebrow="YOUR LIBRARY" title="My documents" description="Upload PDFs, follow their progress, and explore structured summaries." action={<span className="count-label">{documents.length} {documents.length === 1 ? 'paper' : 'papers'}</span>} />
              <form className="upload-panel" onSubmit={uploadDocument}><div className="upload-copy"><span className="upload-heading-icon"><FilePlus2 size={22} /></span><div><h2>Add a new paper</h2><p>We’ll index it for research chat and create a structured summary.</p></div></div><div className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files[0]); }}><UploadCloud size={30} /><strong>{uploadFile ? uploadFile.name : 'Drag a PDF here or choose a file'}</strong><span>PDF only · Maximum 25 MB</span><input ref={fileInputRef} type="file" accept=".pdf,application/pdf" onChange={(event) => selectFile(event.target.files[0])} aria-label="Choose PDF" /></div><div className="upload-actions"><span>{uploadFile ? `${(uploadFile.size / 1024 / 1024).toFixed(2)} MB selected` : 'Your files stay in your workspace.'}</span><button type="submit" className="button button-primary" disabled={!uploadFile || uploading}>{uploading ? 'Uploading…' : 'Upload paper'} <ArrowRight size={17} /></button></div>{uploadFingerprint && <p className="upload-fingerprint">File content ID: <strong>{uploadFingerprint.slice(0, 16)}</strong> · Matching IDs indicate the selected PDFs likely contain the same data, even if their names differ.</p>}</form>
              <div className="section-header"><div><h2>Your papers</h2><p>Indexing and summaries run in the background.</p></div><button className="button button-ghost" onClick={refreshAll}><RefreshCw size={16} /> Refresh</button></div>
              {documents.length ? <div className="documents-list">{documents.map((document) => <DocumentCard key={document.id} document={document} onDelete={deleteDocument} />)}</div> : <EmptyState icon={FileText} title="No papers yet" description="Upload your first research PDF to get started." />}
            </>}

            {page === 'summaries' && <>
              <PageHeading eyebrow="THE BIG PICTURE" title="Saved summaries" description="The important ideas from your most recently summarized papers." action={<span className="count-label">Latest {summaries.length} of 5</span>} />
              {summaries.length ? <div className="summaries-grid">{summaries.map((item) => <article className="panel summary-card" key={item.id}><div className="summary-card-top"><span className="summary-file-icon"><BookOpenText size={22} /></span><button className="icon-button delete-button" title="Delete saved summary" onClick={() => deleteSummary(item.id)}><Trash2 size={17} /></button></div><div className="eyebrow">{item.pdfName}</div><SummaryContent summary={item.summary} /><div className="summary-card-foot"><Clock3 size={15} /> Saved {formatDate(item.createdAt)}</div></article>)}</div> : <EmptyState icon={BookOpenText} title="No summaries yet" description="When a PDF finishes processing, its structured summary appears here." action={<button className="button button-soft" onClick={() => navigate('documents')}>Go to documents <ArrowRight size={16} /></button>} />}
            </>}

            {page === 'chat' && <>
              <PageHeading eyebrow="RESEARCH ASSISTANT" title="Research chat" description="Ask questions and follow answers back to your papers." action={<button className="button button-primary" onClick={newChat}><Plus size={17} /> New chat</button>} />
              <div className="chat-layout"><aside className="chat-sessions"><div className="chat-sessions-heading"><span>CONVERSATIONS</span><span>{sessions.length}</span></div>{sessions.length ? <div className="session-list">{sessions.map((session) => <div className={`session-item ${activeSessionId === session.id ? 'selected' : ''}`} key={session.id}><button className="session-open" onClick={() => openSession(session.id)}><MessageCircle size={17} /><span>{session.title}</span></button><button className="session-delete" title="Delete chat" onClick={() => deleteSession(session.id)}><Trash2 size={15} /></button></div>)}</div> : <p className="sessions-empty">Your conversations will appear here.</p>}<button className="session-new" onClick={newChat}><Plus size={16} /> Start a new chat</button></aside><section className="chat-main"><div className="chat-toolbar"><div><span className="chat-online-dot" /> {activeSessionId ? 'Conversation' : 'New conversation'}</div><span>{readyDocuments.length} searchable {readyDocuments.length === 1 ? 'paper' : 'papers'}</span></div><div className="chat-messages">{loadingSession ? <div className="page-loading"><RefreshCw className="spin" size={22} /> Loading conversation…</div> : messages.length ? messages.map((message) => <div className={`message-row ${message.role}`} key={message.id}><div className="message-avatar">{message.role === 'assistant' ? <Sparkles size={17} /> : (user?.name || 'Y')[0].toUpperCase()}</div><div className="message-body"><div className="message-author">{message.role === 'assistant' ? 'ResearchMind' : 'You'}</div><div className="message-text">{message.content}</div>{Array.isArray(message.sources) && message.sources.length > 0 && <div className="message-sources"><span>Sources</span>{message.sources.map((source, index) => <span className="source-chip" key={`${source.document_id}-${source.page_number}-${index}`}><FileText size={13} /> {source.source} · p. {source.page_number}</span>)}</div>}</div></div>) : <div className="chat-welcome"><span className="chat-welcome-icon"><Sparkles size={31} /></span><div className="eyebrow">YOUR RESEARCH, IN CONTEXT</div><h2>What would you like to explore?</h2><p>Ask about a paper’s findings, methods, authors, or how ideas connect. Answers include the source pages when evidence is available.</p><div className="prompt-suggestions"><button onClick={() => setQuestion('What are the key findings in this paper?')}>What are the key findings?</button><button onClick={() => setQuestion('Summarize the methodology used in this paper.')}>Explain the methodology</button></div></div>}{sending && <div className="message-row assistant"><div className="message-avatar"><Sparkles size={17} /></div><div className="message-body"><div className="message-author">ResearchMind</div><div className="thinking-dots"><span /><span /><span /></div></div></div>}<div ref={chatEndRef} /></div><div className="chat-composer"><div className="doc-selector" role="radiogroup" aria-label="Choose one paper"><span><FileText size={15} /> Paper:</span>{readyDocuments.map((document) => <button type="button" role="radio" aria-checked={selectedDocumentId === document.id} className={selectedDocumentId === document.id ? 'selected' : ''} key={document.id} onClick={() => choosePaper(document.id)}>{selectedDocumentId === document.id && <Check size={13} />}{document.fileName}</button>)}{readyDocuments.length === 0 && <span>No ready papers yet</span>}</div><form className="composer-form" onSubmit={sendMessage}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Ask a question about your research…" rows="2" aria-label="Your question" /><button type="submit" className="send-button" disabled={!question.trim() || sending || !selectedDocumentId} title="Send question"><Send size={19} /></button></form><p>{selectedDocumentId ? 'Answers use only the selected paper. Check the source pages for details.' : 'Select one ready paper above before asking a question.'}</p></div></section></div>
            </>}
          </>}
        </main>
      </div>
    </div>
  );
}
