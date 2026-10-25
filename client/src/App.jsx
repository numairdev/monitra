import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRight, ArrowUpRight, Bell, Check, ChevronRight,
  CircleAlert, Clock3, ExternalLink, Globe2, LayoutDashboard,
  Menu, MoreHorizontal, Pause, Play, Plus, Search, Server,
  Settings2, ShieldCheck, Trash2, X, Zap,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";

const NAV = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "monitors", label: "Monitors", icon: Globe2 },
  { key: "incidents", label: "Incidents", icon: CircleAlert },
  { key: "settings", label: "Settings", icon: Settings2 },
];

async function api(path, options) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `Server returned ${response.status}`);
  return json;
}

function StatusPill({ status }) {
  const labels = { operational: "Operational", degraded: "Degraded", paused: "Paused", pending: "Pending", down: "Down" };
  return <span className={`status-pill ${status}`}><i />{labels[status] || status}</span>;
}

function App() {
  const [sites, setSites] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [backendOnline, setBackendOnline] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState("overview");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [period, setPeriod] = useState("24h");
  const [showAdd, setShowAdd] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [checkEvery, setCheckEvery] = useState("5");

  async function refresh() {
    try {
      const [freshSites, freshIncidents] = await Promise.all([
        api('/monitors'), api('/incidents'),
      ]);
      setSites(freshSites);
      setIncidents(freshIncidents);
      setBackendOnline(true);
    } catch {
      setBackendOnline(false);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    refresh();
    api('/settings').then(value => setCheckEvery(String(value.intervalMinutes))).catch(() => {});
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    api(`/analytics?range=${period}`).then(setChartData).catch(() => setChartData([]));
    const timer = setInterval(() => {
      api(`/analytics?range=${period}`).then(setChartData).catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [period]);

  async function updateInterval(value) {
    try {
      await api('/settings', { method:'PATCH', body:JSON.stringify({ intervalMinutes:Number(value) }) });
      setCheckEvery(value);
      setToast('Real check interval updated.');
    } catch (e) { setToast(e.message); }
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const filtered = useMemo(() => sites.filter(site => {
    const matchText = `${site.name} ${site.url}`.toLowerCase().includes(search.toLowerCase());
    return matchText && (filter === "all" || site.status === filter);
  }), [sites, search, filter]);

  const running = sites.filter(s => s.status !== "paused");
  const operational = sites.filter(s => s.status === "operational").length;
  const measured = sites.filter(s => typeof s.response === "number");
  const uptimes = sites.filter(s => typeof s.uptime === "number");
  const avgResponse = measured.length
    ? Math.round(measured.reduce((sum, s) => sum + s.response, 0) / measured.length)
    : null;
  const avgUptime = uptimes.length
    ? (uptimes.reduce((sum, s) => sum + s.uptime, 0) / uptimes.length).toFixed(2)
    : null;
  const healthPercent = running.length ? Math.round(100 * operational / running.length) : 0;

  function navigate(next) {
    setPage(next);
    setMenuOpen(false);
    setSearch("");
    setFilter("all");
  }

  async function addMonitor(event) {
    event.preventDefault();
    setError('');
    try {
      await api('/monitors', { method: 'POST', body: JSON.stringify({ name:name.trim(), url:url.trim() }) });
      setShowAdd(false);
      setName(''); setUrl('');
      setToast('Monitor added! First live check is running.');
      navigate('monitors');
      await refresh();
    } catch (e) { setError(e.message); }
  }

  async function toggleMonitor(site) {
    try {
      await api(`/monitors/${site.id}`, {
        method: 'PATCH', body: JSON.stringify({action:site.status === 'paused' ? 'active' : 'paused'})
      });
      setToast(site.status === 'paused' ? 'Monitor resumed.' : 'Monitor paused.');
      await refresh();
    } catch (e) { setToast(e.message); }
  }

  async function deleteMonitor(site) {
    if (!window.confirm(`Remove ${site.name} and all its recorded history?`)) return;
    try {
      await api(`/monitors/${site.id}`, {method:'DELETE'});
      setSelected(null);
      setToast('Monitor deleted.');
      await refresh();
    } catch (e) { setToast(e.message); }
  }

  async function checkNow(site) {
    try {
      await api(`/monitors/${site.id}/check`, {method:'POST'});
      setToast('Website check requested. Results will refresh automatically.');
    } catch(e) { setToast(e.message); }
  }

  const liveSelected = selected ? (sites.find(site => site.id === selected.id) || selected) : null;

  function monitorTable(items) {
    return <div className="table-wrap"><table className="monitor-table">
      <thead><tr><th>MONITOR</th><th>STATUS</th><th>UPTIME</th><th>RESPONSE</th><th>ACTIONS</th></tr></thead>
      <tbody>{items.map(site => <tr key={site.id}>
        <td><button className="monitor-identity" onClick={() => setSelected(site)}>
          <span className="site-icon"><Globe2 size={18} /></span>
          <span className="site-description"><strong>{site.name}</strong><small>{site.url}</small></span>
        </button></td>
        <td><StatusPill status={site.status} /></td>
        <td className="numeric">{site.uptime == null ? "—" : `${site.uptime.toFixed(2)}%`}</td>
        <td className="numeric">{site.response == null ? "—" : `${site.response} ms`}</td>
        <td><div className="row-actions">
          <button className="icon-button small" title={site.status === "paused" ? "Resume" : "Pause"} onClick={() => toggleMonitor(site)}>
            {site.status === "paused" ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button className="icon-button small" title="View details" onClick={() => setSelected(site)}><ChevronRight size={17} /></button>
        </div></td>
      </tr>)}</tbody>
    </table>{!items.length && <div className="empty-state"><Search size={22} />{loaded ? "No monitors found. Add your first website!" : "Loading monitors..."}</div>}</div>;
  }

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-symbol"><Activity size={22} strokeWidth={2.5} /></div><div><strong>monitra<span>.</span></strong><small>SYSTEM INTELLIGENCE</small></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="side-nav">{NAV.map(item => <button key={item.key} className={`nav-link ${page === item.key ? "active" : ""}`} onClick={() => navigate(item.key)}>
        <item.icon size={19} strokeWidth={1.85}/>{item.label}{item.key === "incidents" && <span className="nav-count">{incidents.filter(i => i.status !== "Resolved").length}</span>}
      </button>)}</nav>
      <div className="sidebar-bottom"><div className="plan-box"><div className="plan-icon"><Zap size={17}/></div><strong>Built for clarity.</strong><p>Know what matters. Monitor what moves.</p><span>PREVIEW EDITION</span></div>
        <div className="profile"><div className="avatar">M</div><div><strong>My Workspace</strong><small>Local dashboard</small></div><MoreHorizontal size={18}/></div>
      </div>
    </aside>
    {menuOpen && <button className="mobile-shade" onClick={() => setMenuOpen(false)} aria-label="Close menu"/>}

    <main className="main">
      <header className="topbar"><div className="topbar-start"><button className="mobile-menu icon-button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={21}/></button><span className="crumb-muted">Workspace</span><ChevronRight size={14}/><strong>{NAV.find(item => item.key === page)?.label}</strong></div>
        <div className="topbar-end"><span className="preview-chip"><span/> {backendOnline ? "Live monitoring" : "API offline"}</span><button className="icon-button" title="View incidents" onClick={() => navigate("incidents")}><Bell size={19}/></button><div className="top-avatar">M</div></div>
      </header>

      <div className="page-content">
        {!backendOnline && <div className="backend-alert"><CircleAlert size={18}/> Backend offline — start the server in a separate terminal using <code>npm.cmd run dev</code> inside the <strong>server</strong> folder.</div>}
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/> MONITORING WORKSPACE</div>
          <h1>{page === "overview" ? "Good to have you here." : page === "monitors" ? "Your monitors" : page === "incidents" ? "Incident timeline" : "Workspace settings"}</h1>
          <p>{page === "overview" ? "Live visibility into the websites that matter to you." : page === "monitors" ? "Manage websites, inspect their current checks and take action." : page === "incidents" ? "Real outages and recoveries captured by your monitor." : "Manage the frequency of your live monitoring checks."}</p>
        </div><button className="primary-button" onClick={() => { setError(""); setShowAdd(true); }}><Plus size={18}/> Add monitor</button></div>

        {page === "overview" && <>
          <div className="stat-grid">
            <div className="stat-card"><div className="stat-top"><span>Total monitors</span><div className="stat-icon cyan"><Globe2 size={19}/></div></div><div className="stat-value">{sites.length}<span className="stat-detail"> endpoints</span></div><div className="stat-foot"><span className="mini-dot turquoise"/> {running.length} active in preview</div></div>
            <div className="stat-card"><div className="stat-top"><span>Operational</span><div className="stat-icon green"><ShieldCheck size={19}/></div></div><div className="stat-value">{operational}<span className="stat-detail"> / {running.length}</span></div><div className="stat-foot good"><Check size={14}/> Sample healthy services</div></div>
            <div className="stat-card"><div className="stat-top"><span>Avg. response time</span><div className="stat-icon violet"><Activity size={19}/></div></div><div className="stat-value">{avgResponse ?? "—"}<span className="stat-detail"> {avgResponse == null ? "" : "ms"}</span></div><div className="stat-foot">From live HTTP requests</div></div>
            <div className="stat-card"><div className="stat-top"><span>Average uptime</span><div className="stat-icon amber"><Clock3 size={19}/></div></div><div className="stat-value">{avgUptime ?? "—"}<span className="stat-detail">{avgUptime == null ? "" : "%"}</span></div><div className="stat-foot">Based on recorded checks</div></div>
          </div>

          <div className="analytics-grid">
            <section className="panel chart-panel"><div className="panel-header"><div><span className="panel-kicker">PERFORMANCE</span><h2>Response time <span className="muted-h2">/ Live measurements</span></h2><p>Response times from completed checks</p></div><div className="segmented">{["24h", "7d"].map(p => <button key={p} className={period === p ? "selected" : ""} onClick={() => setPeriod(p)}>{p.toUpperCase()}</button>)}</div></div>
              <div className="chart-summary"><span className="chart-big">{avgResponse ?? "—"}<small>ms average</small></span><span className="chart-legend"><i/> Response time</span></div>
              <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:10,right:8,left:-20,bottom:0}}>
                <defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#53d5ca" stopOpacity={0.26}/><stop offset="95%" stopColor="#53d5ca" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid stroke="#26323f" strokeDasharray="4 5" vertical={false}/><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{fill:"#718191",fontSize:11}} minTickGap={25}/><YAxis tickLine={false} axisLine={false} tick={{fill:"#718191",fontSize:11}} domain={[0, "auto"]} tickFormatter={v=>`${v}ms`}/>
                <Tooltip cursor={{stroke:"#506773",strokeDasharray:"3 4"}} contentStyle={{background:"#19232d",border:"1px solid #344453",borderRadius:12,color:"#eaf3f5"}} formatter={v=>[`${v} ms`,"Response"]}/>
                <Area type="monotone" dataKey="value" stroke="#56dacd" strokeWidth={2.7} fill="url(#chartFill)" activeDot={{r:5,fill:"#56dacd",stroke:"#122028",strokeWidth:2}}/>
              </AreaChart></ResponsiveContainer></div>
            </section>

            <section className="panel health-panel"><div className="panel-header"><div><span className="panel-kicker">SYSTEM HEALTH</span><h2>Overview</h2><p>Current monitor status</p></div><div className="soft-icon"><Activity size={18}/></div></div>
              <div className="health-ring" style={{background:`conic-gradient(#59ddbd 0% ${healthPercent}%, #ffb976 ${healthPercent}% 100%)`}}><div><strong>{healthPercent}%</strong><span>OPERATIONAL</span></div></div>
              <div className="health-details"><div><span><i className="legend-dot green-dot"/> Operational</span><strong>{operational}</strong></div><div><span><i className="legend-dot orange-dot"/> Other active</span><strong>{running.length - operational}</strong></div><div><span><i className="legend-dot gray-dot"/> Paused</span><strong>{sites.length - running.length}</strong></div></div>
            </section>
          </div>
          <section className="panel monitor-section"><div className="panel-header"><div><span className="panel-kicker">YOUR INFRASTRUCTURE</span><h2>Monitors <span className="count-bubble">{sites.length}</span></h2><p>Latest measurements from your website monitors</p></div><button className="text-button" onClick={() => navigate("monitors")}>View all <ArrowRight size={16}/></button></div>{monitorTable(sites.slice(0,5))}</section>
          <div className="footer-note"><span className="mini-dot turquoise"/> Real HTTP checks run on the backend at your selected interval.</div>
        </>}

        {page === "monitors" && <section className="panel monitor-section full-page-panel"><div className="panel-header"><div><span className="panel-kicker">ENDPOINTS</span><h2>All monitors <span className="count-bubble">{sites.length}</span></h2><p>Add, inspect or pause your saved entries</p></div></div>
          <div className="table-controls"><div className="search-field"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or URL..." /></div><select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="operational">Operational</option><option value="degraded">Degraded</option><option value="pending">Pending</option><option value="down">Down</option><option value="paused">Paused</option></select></div>
          {monitorTable(filtered)}</section>}

        {page === "incidents" && <section className="panel incidents-panel"><div className="panel-header"><div><span className="panel-kicker">INCIDENT LOG</span><h2>Activity history</h2><p>Automatic incident records for website downtime</p></div><span className="sample-tag">LIVE EVENTS</span></div>
          {incidents.map(incident => <div className="incident-row" key={incident.id}><div className={`incident-icon ${incident.status === "Resolved" ? "resolved" : "warning"}`}><CircleAlert size={19}/></div><div className="incident-description"><strong>{incident.title}</strong><span>{incident.service} <span className="bullet-separator">•</span> {incident.time}</span></div><span className={`incident-status ${incident.status === "Resolved" ? "resolved" : "warning"}`}>{incident.status}</span></div>)}
          {!incidents.length && <div className="incident-explainer"><ShieldCheck size={21}/><div><strong>No incidents recorded</strong><p>Once a website goes down, it will automatically appear here.</p></div></div>}
        </section>}

        {page === "settings" && <div className="settings-layout"><section className="panel settings-panel"><span className="panel-kicker">PREFERENCES</span><h2>Monitoring setup</h2><p>Set how frequently each website is checked.</p><label className="setting-label" htmlFor="interval">Live check interval</label><select id="interval" value={checkEvery} onChange={e => updateInterval(e.target.value)}><option value="1">Every 1 minute</option><option value="5">Every 5 minutes</option><option value="15">Every 15 minutes</option></select><div className="info-strip"><CircleAlert size={18}/> Checks run in the backend while your local server is running.</div></section>
          <section className="panel settings-panel"><span className="panel-kicker">DEVELOPMENT STATUS</span><h2>Build roadmap</h2><div className="roadmap-item"><div className="roadmap-marker done"><Check size={15}/></div><div><strong>Frontend dashboard</strong><p>Interactive UI and saved monitors</p></div></div><div className="roadmap-item"><div className="roadmap-marker done"><Check size={15}/></div><div><strong>Monitoring backend</strong><p>Real HTTP checks and database</p></div></div><div className="roadmap-item"><div className="roadmap-marker">3</div><div><strong>Deployment</strong><p>Hosting, production setup and GitHub README</p></div></div></section></div>}
      </div>
    </main>

    {showAdd && <div className="modal-backdrop" onMouseDown={() => setShowAdd(false)}><div className="modal" onMouseDown={e => e.stopPropagation()}><div className="modal-top"><div className="modal-emblem"><Globe2 size={23}/></div><button className="icon-button" onClick={() => setShowAdd(false)} aria-label="Close"><X size={20}/></button></div><h2>Add a monitor</h2><p>Your website will be checked as soon as it is added.</p><form onSubmit={addMonitor}><label htmlFor="monitor-name">Monitor name</label><input id="monitor-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Portfolio" maxLength={45}/><label htmlFor="monitor-url">Website URL <span>*</span></label><input id="monitor-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" required/>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowAdd(false)}>Cancel</button><button type="submit" className="primary-button"><Plus size={17}/> Add monitor</button></div></form></div></div>}

    {selected && <div className="modal-backdrop" onMouseDown={() => setSelected(null)}><div className="modal detail-modal" onMouseDown={e => e.stopPropagation()}><div className="modal-top"><div className="modal-emblem"><Server size={23}/></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close"><X size={20}/></button></div><h2>{selected.name}</h2><a href={selected.url} target="_blank" rel="noreferrer" className="detail-link">{selected.url}<ExternalLink size={14}/></a><div className="detail-status"><StatusPill status={sites.find(s=>s.id===selected.id)?.status || selected.status}/><span>Measured by MONITRA</span></div><div className="detail-grid"><div><span>Uptime</span><strong>{liveSelected.uptime == null ? "Not measured" : `${liveSelected.uptime.toFixed(2)}%`}</strong></div><div><span>Response</span><strong>{liveSelected.response == null ? "Not measured" : `${liveSelected.response} ms`}</strong></div></div><div className="detail-note">Uptime is calculated from all recorded successful and failed checks.</div><div className="detail-actions"><button className="secondary-button" onClick={()=>checkNow(selected)}><Activity size={16}/> Check now</button><button className="secondary-button" onClick={()=>{toggleMonitor(liveSelected);setSelected(null);}}>{liveSelected.status === "paused" ? <Play size={16}/> : <Pause size={16}/>} {liveSelected.status === "paused" ? "Resume" : "Pause"}</button><button className="danger-button" onClick={()=>deleteMonitor(selected)}><Trash2 size={16}/> Remove</button></div></div></div>}
    {toast && <div className="toast"><Check size={17}/>{toast}</div>}
  </div>;
}

export default App;
