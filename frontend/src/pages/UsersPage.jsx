import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Trash2, UsersRound } from 'lucide-react';
import { apiRequest } from '../api/client';

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default function UsersPage({ token, currentUserId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadUsers = useCallback(async () => {
    const data = await apiRequest('/api/users', { token });
    setUsers(data.users || []);
  }, [token]);

  useEffect(() => {
    loadUsers().catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [loadUsers]);

  async function refresh() {
    setError('');
    setLoading(true);
    try { await loadUsers(); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }

  async function remove(user) {
    if (!window.confirm(`Delete ${user.name} (${user.email}) and all their documents and chats? This cannot be undone.`)) return;
    setDeletingId(user.id);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/users/${user.id}`, { method: 'DELETE', token });
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setNotice(`${user.name} was deleted.`);
    } catch (requestError) {
      setError(requestError.message);
      await loadUsers().catch(() => {});
    } finally {
      setDeletingId(null);
    }
  }

  return <>
    <div className="page-heading">
      <div><div className="eyebrow">ADMINISTRATION</div><h1>Users</h1><p>View accounts and remove users from the system.</p></div>
      <div className="heading-action"><button className="button button-ghost" type="button" onClick={refresh} disabled={loading}><RefreshCw size={16} /> Refresh</button></div>
    </div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {notice && <div className="alert alert-success" role="status">{notice}</div>}
    {loading ? <div className="page-loading"><RefreshCw size={25} className="spin" /> Loading users…</div>
      : users.length ? <div className="users-list">
        {users.map((user) => <article className="user-row" key={user.id}>
          <span className="user-row-avatar"><UsersRound size={20} /></span>
          <div className="user-row-identity"><strong>{user.name}</strong><span>{user.email}</span></div>
          <div className="user-row-details"><span className="user-role">{user.role === 'admin' ? 'Admin' : 'User'}</span><span>{user.documentCount} {user.documentCount === 1 ? 'document' : 'documents'}</span><span>Joined {formatDate(user.createdAt)}</span></div>
          <button className="icon-button delete-button" type="button" title={user.id === currentUserId ? 'You cannot delete your own account' : `Delete ${user.name}`} aria-label={`Delete ${user.name}`} disabled={user.id === currentUserId || deletingId !== null} onClick={() => remove(user)}><Trash2 size={18} /></button>
        </article>)}
      </div> : <div className="empty-state"><span className="empty-icon"><UsersRound size={27} /></span><h3>No users found</h3></div>}
  </>;
}
