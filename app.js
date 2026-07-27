/* ============================================================
   多功能个人工作台 - 核心应用脚本
   ============================================================ */

/* ============== 工具函数 ============== */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtMoney = (n) => {
  const v = Number(n) || 0;
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const showToast = (msg) => {
  let t = $('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 1800);
};

/* ============== 本地存储 ============== */
const DB_KEY = 'workbench_v1';
const DB = {
  load() {
    try {
      return JSON.parse(localStorage.getItem(DB_KEY)) || {};
    } catch { return {}; }
  },
  save(data) {
    localStorage.setItem(DB_KEY, JSON.stringify(data));
  }
};

/* ============== 状态 ============== */
const state = {
  ...DB.load(),
  currentView: 'overview',   // 当前右侧视图
  // 视图栈: 'main' = 一级菜单; 'todo.sub' = 二级菜单
  breadcrumb: [],
  calMonth: new Date(),
  calSelected: todayKey(),
  todayStatus: null
};

if (!state.budget) state.budget = 5000;
if (!state.expenses) state.expenses = [];   // [{id, amount, date, note}]
if (!state.todoByDate) state.todoByDate = {};   // { 'YYYY-MM-DD': [{id,text,done,fromTpl}] }
if (!state.tplLib) state.tplLib = [];      // [{id, name}]
if (!state.plans) state.plans = [];        // [{id, title, content, progress, createdAt, archived}]
if (!state.archivedPlans) state.archivedPlans = [];
if (!state.weights) state.weights = [];    // [{id, value, date}]
if (!state.exercises) state.exercises = []; // [{id, name, duration, date}]
if (!state.weightGoal) state.weightGoal = null;  // 目标体重 kg
if (!state.feedArticles) state.feedArticles = [];  // [{id, title, url, platform, publishedAt, addedAt}]
if (!state.savings) state.savings = [];  // [{id, type:'in'|'out', amount, note, date}]
if (!state.treehole) state.treehole = { password: null, posts: [] };  // 树洞（密码保护）
if (!state.menuOpen) state.menuOpen = { plan: true, todo: true, weight: true, treehole: true, feed: true, savings: true };

// 树洞解锁状态：不持久化，每次进入树洞都需重新输密码
let treeholeUnlocked = false;

// 输入草稿：自动实时保存，防止意外丢失
if (!state.drafts) state.drafts = {};

// 数据迁移：旧的 plan 结构（content/progress 在顶层）→ 新的（stages 数组）
state.plans = (state.plans || []).map(p => {
  if (p.stages) return p;
  return {
    id: p.id,
    title: p.title,
    description: '',
    stages: p.content ? [{
      id: uid(),
      title: '阶段 1',
      startDate: '',
      endDate: '',
      content: p.content,
      progress: p.progress || 0
    }] : [],
    createdAt: p.createdAt
  };
});

const persist = () => DB.save(state);

/* ============== 菜单定义 ============== */
const MENU = [
  {
    id: 'plan',
    label: '总计划',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    children: [
      { id: 'plan.list', label: '计划列表', view: 'plan' },
      { id: 'plan.archive', label: '历史归档', view: 'plan-archive' }
    ]
  },
  {
    id: 'todo',
    label: '每日 ListTodo',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    children: [
      { id: 'todo.today', label: '当日待办清单', view: 'todo-today' },
      { id: 'todo.calendar', label: '日历任务回溯', view: 'todo-calendar' },
      { id: 'todo.template', label: '常用任务模板', view: 'todo-template' }
    ]
  },
  {
    id: 'feed',
    label: '投放资讯',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m2 13a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z"/></svg>`,
    children: [
      { id: 'feed.list', label: '内容聚合', view: 'feed' }
    ]
  },
  {
    id: 'savings',
    label: '攒钱',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5h-2V3H7v2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`,
    children: [
      { id: 'savings.list', label: '攒钱记录', view: 'savings' }
    ]
  },
  {
    id: 'treehole',
    label: '树洞',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/></svg>`,
    children: [
      { id: 'treehole.list', label: '我的树洞', view: 'treehole' }
    ]
  },
  {
    id: 'weight',
    label: '减肥计划',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    children: [
      { id: 'weight.log', label: '体重与运动', view: 'weight' }
    ]
  }
];

/* ============== 渲染侧边栏 ============== */
function renderSidebar() {
  const menu = $('#menu');
  menu.innerHTML = MENU.map((group) => {
    const isOpen = state.menuOpen[group.id];
    return `
      <div class="menu-group">
        <button class="menu-group-header ${isOpen ? 'open' : ''}" data-group="${group.id}">
          <span class="left">${group.icon}<span>${group.label}</span></span>
          <svg class="arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="menu-items">
          ${group.children.map((c) => `
            <button class="menu-item ${state.currentView === c.view ? 'active' : ''}" data-view="${c.view}">
              <span>${c.label}</span>
              <span class="dot"></span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  $$('.menu-group-header').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.group;
      state.menuOpen[id] = !state.menuOpen[id];
      persist();
      renderSidebar();
    });
  });
  $$('.menu-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.currentView = btn.dataset.view;
      // 进入树洞时强制重置解锁状态（每次都要重新输密码）
      if (state.currentView === 'treehole') treeholeUnlocked = false;
      persist();
      renderSidebar();
      renderMain();
      // 移动端关闭
      $('#sidebar').classList.remove('open');
      $('#overlay').classList.remove('show');
    });
  });
}

/* ============== 渲染右侧 ============== */
function renderMain() {
  const main = $('#main');
  // 渲染前先抓取所有输入框的当前值到 drafts
  saveCurrentDrafts();
  let html = '';
  switch (state.currentView) {
    case 'overview': html = renderOverview(); break;
    case 'plan': html = renderPlan(); break;
    case 'plan-archive': html = renderPlanArchive(); break;
    case 'todo-today': html = renderTodoToday(); break;
    case 'todo-calendar': html = renderTodoCalendar(); break;
    case 'todo-template': html = renderTodoTemplate(); break;
    case 'feed': html = renderFeed(); break;
    case 'weight': html = renderWeight(); break;
    case 'savings': html = renderSavings(); break;
    case 'treehole': html = renderTreehole(); break;
    default: html = renderOverview();
  }
  main.innerHTML = `
    <div class="page-header">
      <button class="menu-btn" id="mobileMenuBtn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <div class="page-title-wrap">
        <h1>${getPageTitle()}</h1>
        <div class="sub">${getPageSub()}</div>
      </div>
    </div>
    ${html}
  `;

  bindMainEvents();
  bindAutoSaveDrafts();
  $('#mobileMenuBtn')?.addEventListener('click', openMobileSidebar);
  // 渲染后从 drafts 恢复 input 值
  restoreDrafts();
}

/* 渲染前抓取当前 DOM 中的输入值到 drafts */
function saveCurrentDrafts() {
  const root = $('#main');
  if (!root) return;
  $$('#main input, #main textarea, #main select').forEach((el) => {
    if (el.id) state.drafts[el.id] = el.value;
  });
}

/* 渲染后从 drafts 把值恢复到 DOM（仅恢复 draft 里有值的） */
function restoreDrafts() {
  $$('#main input, #main textarea, #main select').forEach((el) => {
    if (el.id && state.drafts[el.id] !== undefined && state.drafts[el.id] !== '') {
      el.value = state.drafts[el.id];
    }
  });
}

/* 自动保存草稿：所有 input/textarea/select 的内容实时同步到 state.drafts */
let draftSaveTimer = null;
function schedulePersist() {
  if (draftSaveTimer) return;
  draftSaveTimer = setTimeout(() => {
    persist();
    draftSaveTimer = null;
  }, 300);
}
function bindAutoSaveDrafts() {
  const root = $('#main');
  if (!root) return;
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {
      state.drafts[t.id] = t.value;
      schedulePersist();
    }
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {
      state.drafts[t.id] = t.value;
      persist();
    }
  });
}

/* 读取草稿值（优先用草稿，否则用默认值） */
const draft = (id, def = '') => {
  const v = state.drafts[id];
  return v === undefined ? def : v;
};

function getPageTitle() {
  const map = {
    'overview': '首页概览',
    'plan': '总计划',
    'plan-archive': '历史归档',
    'todo-today': '当日待办清单',
    'todo-calendar': '日历任务回溯',
    'todo-template': '常用任务模板',
    'feed': '投放资讯',
    'weight': '减肥计划',
    'savings': '攒钱',
    'treehole': '树洞'
  };
  return map[state.currentView] || '工作台';
}
function getPageSub() {
  const map = {
    'overview': '今日支出 · 月度预算 · 账户余额 · 一站搞定',
    'plan': '拆解总目标为多个阶段，逐阶段推进，自动归档历史',
    'plan-archive': '查看已完结的总计划与阶段',
    'todo-today': '勾选完成、自动联动模板、统计本月完成率',
    'todo-calendar': '点击任意日期，回溯当日全部待办',
    'todo-template': '沉淀常用任务，一键关联当日清单',
    'feed': '手动录入文章/笔记链接，点击跳转原文',
    'weight': '每日体重、运动项目，永久保存历史',
    'savings': '记录每一笔攒入或取出，实时显示当前已攒总额',
    'treehole': '隐私倾诉空间 · 数字密码保护 · 仅你能看见'
  };
  return map[state.currentView] || '';
}

/* ============== 首页概览 ============== */
function renderOverview() {
  const now = new Date();
  const mKey = monthKey(now);
  const mDays = daysInMonth(now.getFullYear(), now.getMonth() + 1);
  const monthExpense = state.expenses
    .filter((e) => e.date.startsWith(mKey))
    .reduce((s, e) => s + Number(e.amount), 0);
  const todayExpense = state.expenses
    .filter((e) => e.date === todayKey())
    .reduce((s, e) => s + Number(e.amount), 0);
  const remaining = Math.max(0, state.budget - monthExpense);
  const pct = Math.min(100, Math.round((monthExpense / state.budget) * 100));

  // 今日待办统计
  const todayTodos = state.todoByDate[todayKey()] || [];
  const todoDone = todayTodos.filter((t) => t.done).length;

  // 状态建议
  const statusTips = {
    'good': '状态很好，建议安排高强度学习或重点任务。',
    'normal': '一般状态，先从简单任务起步，慢慢进入状态。',
    'tired': '很累，建议今天只做最低保底任务，早点休息。',
    'broken': '已崩溃，给自己放半天假，恢复优先。'
  };
  const statusLabels = { good: '状态很好', normal: '一般', tired: '很累', broken: '崩了' };

  return `
    <div class="hero-card">
      <div class="hero-num">${todoDone}/${todayTodos.length}</div>
      <div class="hero-label">今日待办完成进度</div>
      <div class="hero-meta">
        <div class="hero-meta-item">
          <div class="label">已攒</div>
          <div class="val">¥${fmtMoney(savingsBalance())}</div>
        </div>
        <div class="hero-meta-item">
          <div class="label">投放文章</div>
          <div class="val">${state.feedArticles.length} 篇</div>
        </div>
        <div class="hero-meta-item">
          <div class="label">总计划数</div>
          <div class="val">${state.plans.filter(p => !p.archived).length} 项</div>
        </div>
        <div class="hero-meta-item">
          <div class="label">本月天数</div>
          <div class="val">${mDays} 天</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">今日记账总览</div>
      <div class="card-sub">记录支出、管理月度预算、实时查看账户剩余余额</div>

      <div class="accounting-grid">
        <div class="acct-card acct-today">
          <div class="label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            今日支出
          </div>
          <div class="big-num">¥${fmtMoney(todayExpense)}</div>
          <div class="meta">记录 ${state.expenses.filter(e => e.date === todayKey()).length} 笔</div>
          <div class="acct-input-row">
            <input type="number" step="0.01" class="input" id="expenseInput" placeholder="输入金额，回车记录" />
            <button class="btn" id="addExpenseBtn">记录</button>
          </div>
        </div>

        <div class="acct-card acct-remaining">
          <div class="label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            月度剩余金额
          </div>
          <div class="big-num">¥${fmtMoney(remaining)}</div>
          <div class="meta">本月已花 ¥${fmtMoney(monthExpense)} / ¥${fmtMoney(state.budget)}</div>
          <div class="progress-bar"><div class="fill" style="width:${pct}%"></div></div>
          <div class="meta" style="margin-bottom:0">预算消耗 ${pct}%</div>
        </div>
      </div>

      <div class="budget-row">
        <span>修改本月预算总额：</span>
        <input type="number" class="input" id="budgetInput" value="${state.budget}" style="width:140px" />
        <button class="btn btn-sm btn-soft" id="saveBudgetBtn">保存</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">今日状态</div>
      <div class="card-sub">先看状态，再定任务</div>
      <div class="status-row" id="statusRow">
        ${['good', 'normal', 'tired', 'broken'].map((k) => `
          <button class="status-pill ${state.todayStatus === k ? 'active' : ''}" data-status="${k}">${statusLabels[k]}</button>
        `).join('')}
      </div>
      <div class="tip-card">
        <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-6 0v4"/><path d="M5 9h14l1 12H4z"/></svg>
        <span>${state.todayStatus ? statusTips[state.todayStatus] : '选择你今天的状态，系统会给出相应建议'}</span>
      </div>
    </div>

    <div class="card">
      <div class="card-title">今日待办快速查看</div>
      <div class="card-sub">未完成任务保持深色高亮，已完成显示浅灰</div>
      <ul class="todo-list" id="quickTodoList">
        ${(state.todoByDate[todayKey()] || []).map(t => `
          <li class="todo-item" data-id="${t.id}">
            <div class="todo-check ${t.done ? 'checked' : ''}" data-quick="${t.id}">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <span class="todo-text ${t.done ? 'done' : ''}">${escapeHtml(t.text)}</span>
          </li>
        `).join('') || `<li style="padding:20px;color:var(--text-light);font-size:13px;text-align:center">今日还没有待办，去【每日 ListTodo】添加</li>`}
      </ul>
    </div>
  `;
}

/* ============== 总计划（总目标 + 阶段拆分） ============== */
function renderPlan() {
  const active = state.plans.filter((p) => !p.archived);
  return `
    <div class="card">
      <div class="card-title">新建总计划</div>
      <div class="card-sub">先定一个长期总目标，再把它拆解成多个阶段，逐步推进</div>
      <div class="plan-input-row">
        <input type="text" class="input" id="planTitleInput" placeholder="总计划名称（如：考研上岸 / 减肥到 65kg）" />
        <input type="text" class="input" id="planDescInput" placeholder="计划简介（可选）" />
        <button class="btn" id="addPlanBtn">创建总计划</button>
      </div>
    </div>

    ${active.length === 0 ? `
      <div class="card" style="text-align:center;color:var(--text-light);padding:40px 20px">
        还没有任何总计划，先创建一个长期目标，再添加阶段
      </div>
    ` : active.map((p, i) => renderPlanCard(p, i)).join('')}

    <div class="plan-archive-link" style="text-align:center;margin-top:14px">
      <button class="btn btn-ghost btn-sm" id="goArchiveBtn">查看历史归档 (${state.archivedPlans.length}) →</button>
    </div>
  `;
}

function renderPlanCard(plan, index) {
  const stages = plan.stages || [];
  const totalProgress = stages.length
    ? Math.round(stages.reduce((s, st) => s + Number(st.progress || 0), 0) / stages.length)
    : 0;

  return `
    <div class="plan-total-card" data-id="${plan.id}">
      <div class="plan-total-head">
        <div class="plan-total-title">
          <span class="ord">${index + 1}</span>
          ${escapeHtml(plan.title)}
        </div>
        <div class="plan-total-actions">
          <button class="btn btn-sm btn-ghost" data-archive="${plan.id}">归档</button>
          <button class="btn btn-sm btn-danger" data-del-plan="${plan.id}">删除</button>
        </div>
      </div>
      ${plan.description ? `<div class="plan-total-desc">${escapeHtml(plan.description)}</div>` : ''}
      <div class="plan-total-meta">
        <span>创建于 ${plan.createdAt}</span>
        <span>·</span>
        <span>共 ${stages.length} 个阶段</span>
        <span>·</span>
        <span>整体进度 ${totalProgress}%</span>
      </div>

      <div class="stage-timeline">
        ${stages.map((s, idx) => `
          <div class="stage-item" data-stage="${s.id}">
            <div class="stage-dot ${s.progress >= 100 ? 'done' : (idx === currentStageIndex(stages) ? 'active' : '')}">
              ${s.progress >= 100 ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : (idx + 1)}
            </div>
            ${idx < stages.length - 1 ? '<div class="stage-line"></div>' : ''}
            <div class="stage-content">
              <div class="stage-head">
                <div class="stage-title">${escapeHtml(s.title)}</div>
                <div class="stage-actions">
                  <button class="btn btn-sm btn-ghost" data-edit-stage="${s.id}">编辑</button>
                  <button class="btn btn-sm btn-danger" data-del-stage="${s.id}">删除</button>
                </div>
              </div>
              <div class="stage-range">${s.startDate || '?'} 至 ${s.endDate || '?'}</div>
              ${s.content ? `<div class="stage-content-text">${escapeHtml(s.content)}</div>` : '<div class="stage-content-text" style="color:var(--text-light)">（未填写阶段内容）</div>'}
              <div class="plan-progress">
                <span style="font-size:12px;color:var(--text-sub)">进度</span>
                <input type="range" min="0" max="100" value="${s.progress}" class="slider" data-progress="${s.id}" />
                <span class="pct-text">${s.progress}%</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="add-stage-form">
        <input type="text" class="input stage-title-input" data-stage-title="${plan.id}" placeholder="阶段标题（如：第1阶段 - 基础期）" style="margin-bottom:8px" />
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <input type="date" class="input stage-start" data-stage-start="${plan.id}" />
          <input type="date" class="input stage-end" data-stage-end="${plan.id}" />
        </div>
        <textarea class="input stage-content-input" data-stage-content="${plan.id}" placeholder="本阶段要做的事 / 目标拆解" rows="2" style="resize:vertical;margin-bottom:8px"></textarea>
        <button class="btn btn-soft btn-sm" data-add-stage="${plan.id}" style="width:100%">+ 添加阶段</button>
      </div>
    </div>
  `;
}

function currentStageIndex(stages) {
  for (let i = 0; i < stages.length; i++) {
    if (stages[i].progress < 100) return i;
  }
  return stages.length > 0 ? stages.length - 1 : -1;
}

function renderPlanArchive() {
  return `
    <div class="card">
      <div class="card-title">历史归档 (${state.archivedPlans.length})</div>
      <div class="card-sub">查看已完结的总计划，可点击展开查看阶段明细</div>
      ${state.archivedPlans.length === 0 ?
        '<div style="color:var(--text-light);padding:30px 0;text-align:center;font-size:13px">暂无归档计划</div>' :
        state.archivedPlans.map((p, i) => `
          <div class="archive-card" data-id="${p.id}">
            <div class="archive-head" data-toggle-archive="${p.id}">
              <div>
                <div style="font-size:14px;font-weight:600">${escapeHtml(p.title)}</div>
                <div style="font-size:11px;color:var(--text-light);margin-top:4px">
                  归档于 ${p.archivedAt} · ${(p.stages || []).length} 个阶段
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="archive-body" id="archive-body-${p.id}">
              ${p.description ? `<div style="font-size:12px;color:var(--text-sub);margin-bottom:10px">${escapeHtml(p.description)}</div>` : ''}
              ${(p.stages || []).map(s => `
                <div style="background:#fff;border-radius:var(--radius-soft);padding:10px 12px;margin-bottom:6px;font-size:13px">
                  <div style="font-weight:500">${escapeHtml(s.title)}</div>
                  <div style="font-size:11px;color:var(--text-light);margin-top:3px">${s.startDate || '?'} 至 ${s.endDate || '?'} · 完成度 ${s.progress}%</div>
                </div>
              `).join('') || '<div style="font-size:12px;color:var(--text-light)">无阶段记录</div>'}
              <div style="margin-top:10px;text-align:right">
                <button class="btn btn-sm btn-danger" data-del-archive="${p.id}">彻底删除</button>
              </div>
            </div>
          </div>
        `).join('')}
    </div>
  `;
}

/* ============== 当日待办清单 ============== */
function renderTodoToday() {
  const date = todayKey();
  const todos = state.todoByDate[date] || [];

  // 本月完成统计
  const mKey = monthKey();
  const tplStats = state.tplLib.map((tpl) => {
    const count = state.expenses.length; // dummy
    let done = 0, total = 0;
    Object.keys(state.todoByDate).forEach((d) => {
      if (!d.startsWith(mKey)) return;
      state.todoByDate[d].forEach((t) => {
        if (t.fromTpl === tpl.id) {
          total++;
          if (t.done) done++;
        }
      });
    });
    return { ...tpl, done, total };
  });

  return `
    <div class="card">
      <div class="card-title">${date} 当日待办</div>
      <div class="card-sub">勾选完成即可标记，自动联动模板统计</div>
      <div class="todo-input-row">
        <input type="text" class="input" id="todoInput" placeholder="新增一条待办任务，回车确认" />
        <select class="template-select" id="tplSelect">
          <option value="">— 选择常用模板 —</option>
          ${state.tplLib.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
        </select>
        <button class="btn" id="addTodoBtn">添加</button>
      </div>
      <ul class="todo-list">
        ${todos.length === 0 ? `<li style="padding:20px;text-align:center;color:var(--text-light);font-size:13px">还没有任务，添加第一条吧</li>` :
          todos.map(t => `
            <li class="todo-item" data-id="${t.id}">
              <div class="todo-check ${t.done ? 'checked' : ''}" data-toggle="${t.id}">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <span class="todo-text ${t.done ? 'done' : ''}">${escapeHtml(t.text)}</span>
              ${t.fromTpl ? `<span class="todo-meta"><span class="from-tpl">${escapeHtml(state.tplLib.find(x => x.id === t.fromTpl)?.name || '模板')}</span></span>` : ''}
              <button class="del" data-del-todo="${t.id}">×</button>
            </li>
          `).join('')}
      </ul>
      <div class="todo-stats">
        <span>已完成 <span class="num">${todos.filter(t=>t.done).length}</span> / ${todos.length}</span>
        <span>完成率 <span class="num">${todos.length ? Math.round(todos.filter(t=>t.done).length / todos.length * 100) : 0}%</span></span>
      </div>
    </div>

    <div class="card">
      <div class="card-title">本月常用任务完成情况</div>
      <div class="card-sub">实时统计本月完成次数与比例，分母按当月总天数自动匹配</div>
      ${tplStats.length === 0 ? '<div style="color:var(--text-light);font-size:13px;padding:10px 0">还没有模板，先去【常用任务模板】添加</div>' :
        tplStats.map(tpl => {
          const mDays = daysInMonth(new Date().getFullYear(), new Date().getMonth() + 1);
          const pct = Math.round(tpl.done / mDays * 100);
          return `
            <div class="tpl-row">
              <div class="name">${escapeHtml(tpl.name)}</div>
              <div class="count">本月 ${tpl.done} 次</div>
              <div class="pct">${pct}%</div>
            </div>
          `;
        }).join('')}
    </div>
  `;
}

/* ============== 日历任务回溯 ============== */
function renderTodoCalendar() {
  const cm = state.calMonth;
  const year = cm.getFullYear();
  const month = cm.getMonth();
  const mKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const totalDays = daysInMonth(year, month + 1);
  const today = todayKey();

  // 标记哪些日期有数据
  const dataDays = new Set();
  Object.keys(state.todoByDate).forEach((d) => {
    if (d.startsWith(mKey) && state.todoByDate[d].length > 0) dataDays.add(d);
  });

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(`<div class="cal-day empty"></div>`);
  for (let d = 1; d <= totalDays; d++) {
    const dk = `${mKey}-${String(d).padStart(2, '0')}`;
    const cls = [
      'cal-day',
      dk === today ? 'today' : '',
      dk === state.calSelected ? 'selected' : '',
      dataDays.has(dk) ? 'has-data' : ''
    ].filter(Boolean).join(' ');
    cells.push(`<button class="${cls}" data-day="${dk}">${d}</button>`);
  }

  const selectedTodos = state.todoByDate[state.calSelected] || [];

  return `
    <div class="card">
      <div class="card-title">日历任务回溯</div>
      <div class="card-sub">点击任意日期，下方加载该日全部任务</div>
      <div class="calendar">
        <div class="cal-header">
          <div class="month">${year} 年 ${month + 1} 月</div>
          <div class="nav">
            <button class="cal-nav-btn" id="prevMonth">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button class="cal-nav-btn" id="nextMonth">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
        <div class="cal-grid">
          ${['日','一','二','三','四','五','六'].map(w => `<div class="cal-weekday">${w}</div>`).join('')}
          ${cells.join('')}
        </div>
      </div>
      <div class="cal-day-detail">
        <h4>${state.calSelected} 的待办 (${selectedTodos.length})</h4>
        ${selectedTodos.length === 0 ?
          '<div class="empty-line">该日期暂无待办</div>' :
          `<ul class="todo-list">
            ${selectedTodos.map(t => `
              <li class="todo-item">
                <div class="todo-check ${t.done ? 'checked' : ''}">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <span class="todo-text ${t.done ? 'done' : ''}">${escapeHtml(t.text)}</span>
              </li>
            `).join('')}
          </ul>`}
      </div>
    </div>
  `;
}

/* ============== 常用任务模板 ============== */
function renderTodoTemplate() {
  const mKey = monthKey();
  const mDays = daysInMonth(new Date().getFullYear(), new Date().getMonth() + 1);

  return `
    <div class="card">
      <div class="card-title">添加常用模板</div>
      <div class="card-sub">自定义常用任务，在当日待办中一键关联</div>
      <div class="todo-input-row">
        <input type="text" class="input" id="tplInput" placeholder="如：背单词 30 分钟 / 阅读 1 篇 / 健身 30 分钟" />
        <button class="btn" id="addTplBtn">添加模板</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">模板列表 (${state.tplLib.length})</div>
      <div class="card-sub">下方自动统计【本月完成次数】与当月完成比例（分母=${mDays}天）</div>
      ${state.tplLib.length === 0 ?
        '<div style="color:var(--text-light);padding:14px 0;font-size:13px">还没有任何模板，先添加一个吧</div>' :
        state.tplLib.map(tpl => {
          let done = 0;
          Object.keys(state.todoByDate).forEach((d) => {
            if (!d.startsWith(mKey)) return;
            state.todoByDate[d].forEach((t) => {
              if (t.fromTpl === tpl.id && t.done) done++;
            });
          });
          const pct = Math.round(done / mDays * 100);
          return `
            <div class="tpl-row">
              <div class="name">${escapeHtml(tpl.name)}</div>
              <div class="count">本月 ${done} 次</div>
              <div class="pct">${pct}%</div>
              <button class="del-btn" data-del-tpl="${tpl.id}">×</button>
            </div>
          `;
        }).join('')}
    </div>
  `;
}

/* ============== 投放资讯（智能粘贴解析 + 跳转原文） ============== */
function renderFeed() {
  const articles = [...state.feedArticles].sort((a, b) =>
    (b.publishedAt || b.addedAt).localeCompare(a.publishedAt || a.addedAt)
  );
  const platformLabels = { wx: '微信公众号', xhs: '小红书', other: '其他平台' };

  return `
    <div class="card smart-paste-card">
      <div class="card-title">
        <span class="card-icon">📋</span>
        智能粘贴（推荐）
      </div>
      <div class="card-sub">从微信、小红书等 App 复制的内容通常包含标题 + 链接 + 推广话术，粘贴到下面自动解析</div>
      <textarea class="input" id="smartPasteInput" rows="3" style="resize:vertical;margin-bottom:10px" placeholder="直接 Ctrl/Cmd + V 粘贴，例如：&#10;&#10;一刀流真的失效了吗？ 过去几天，如果你一直在 Facebo... http://xhslink.cn/o/7loFjB6ciMh 带走口令，来【小红书】发现精彩"></textarea>
      <div id="parsePreview"></div>
    </div>

    <div class="card">
      <div class="card-title">手动添加</div>
      <div class="card-sub">或直接填写标题、链接、平台、发布日期</div>
      <div style="display:grid;grid-template-columns:1fr 140px;gap:8px;margin-bottom:8px">
        <input type="text" class="input" id="feedTitleInput" placeholder="标题（必填）" />
        <select class="input" id="feedPlatformInput">
          <option value="wx">微信公众号</option>
          <option value="xhs">小红书</option>
          <option value="other">其他平台</option>
        </select>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;margin-bottom:10px">
        <input type="url" class="input" id="feedUrlInput" placeholder="文章链接（必填）" />
        <input type="date" class="input" id="feedDateInput" />
      </div>
      <button class="btn" id="addFeedBtn" style="width:100%">添加到列表</button>
    </div>

    <div class="card">
      <div class="card-title">已收录内容 (${articles.length})</div>
      <div class="card-sub">按发布日期倒序 · 点击卡片打开原文（新窗口）</div>
      ${articles.length === 0 ?
        '<div class="feed-empty">还没有收录任何文章，把发布过的内容链接粘贴进来开始管理</div>' :
        `<div class="feed-list">
          ${articles.map(a => `
            <div class="feed-row" data-id="${a.id}">
              <a class="feed-row-main" href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">
                <div class="feed-row-head">
                  <span class="feed-platform feed-platform-${a.platform}">${platformLabels[a.platform] || '其他'}</span>
                  <span class="feed-row-date">${a.publishedAt || a.addedAt}</span>
                </div>
                <div class="feed-row-title">${escapeHtml(a.title)}</div>
                <div class="feed-row-url">${escapeHtml(a.url)}</div>
              </a>
              <button class="del-link" data-del-feed="${a.id}">删除</button>
            </div>
          `).join('')}
        </div>`}
    </div>

    <div class="card">
      <div class="card-title">批量导入</div>
      <div class="card-sub">多行粘贴，每行支持【纯链接】、【标题 | 链接 | 日期】、【带文字的混合文本】，自动逐行解析</div>
      <textarea class="input" id="feedBulkInput" rows="4" style="resize:vertical;margin-bottom:8px" placeholder="一行一条，混合格式也行：&#10;如何在 3 个月内减重 10kg | https://mp.weixin.qq.com/s/xxx | 2026-07-20&#10;一刀流真的失效了吗？... http://xhslink.cn/o/xxx  小红书"></textarea>
      <button class="btn btn-soft btn-sm" id="bulkImportBtn">批量导入</button>
    </div>
  `;
}

/* ----- 智能解析：从混合文本中提取标题/链接/平台 ----- */
function parseFeedText(raw) {
  if (!raw) return null;
  const text = String(raw).trim();

  // 提取 URL（中文/空白前的部分）
  const urlMatch = text.match(/(https?:\/\/[^\s\u4e00-\u9fff]+)/);
  if (!urlMatch) return null;
  const url = urlMatch[1];

  // 链接前文本 = 候选标题
  let before = text.slice(0, urlMatch.index).trim();
  // 链接后文本 = 平台提示词等
  let after = text.slice(urlMatch.index + url.length).trim();

  // 清理标题：去掉尾部省略号、句末符号
  let title = before
    .replace(/[…\.。]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 如果链接前是平台话术（如"小红书"），但链接后才是标题，则反转
  if ((!title || title.length < 4) && after) {
    const afterFirst = after.split(/[，。！？,~～\s]/)[0].trim();
    if (afterFirst.length >= 4 && !/^[\u4e00-\u9fff]{0,3}$/.test(afterFirst) === false && afterFirst.length > title.length) {
      title = afterFirst;
    }
  }

  // 兜底：取原始文本前 50 字
  if (!title) title = text.slice(0, 50).replace(/\s+/g, ' ').trim();

  // 限制标题长度
  if (title.length > 80) title = title.slice(0, 80) + '…';

  // 平台识别
  let platform = 'other';
  const lowerUrl = url.toLowerCase();
  const lowerText = (text).toLowerCase();
  if (/xiaohongshu\.com|xhslink\.cn/.test(lowerUrl) || /小红书/.test(text)) platform = 'xhs';
  else if (/mp\.weixin\.qq\.com|weixin\.qq\.com\/s/.test(lowerUrl) || /微信公众号/.test(text)) platform = 'wx';
  else if (/douyin\.com|iesdouyin\.com/.test(lowerUrl)) platform = 'other';
  else if (/(微博|weibo)/.test(text)) platform = 'other';
  else if (/(知乎|zhihu)/.test(text)) platform = 'other';

  return { title, url, platform };
}

function renderParsePreview(parsed) {
  if (!parsed) return '';
  const platformLabels = { wx: '微信公众号', xhs: '小红书', other: '其他平台' };
  return `
    <div class="parse-preview">
      <div class="parse-preview-title">✓ 已识别，可一键填入下方：</div>
      <div class="parse-preview-row">
        <span class="parse-key">标题</span>
        <span class="parse-val">${escapeHtml(parsed.title)}</span>
      </div>
      <div class="parse-preview-row">
        <span class="parse-key">链接</span>
        <span class="parse-val parse-url">${escapeHtml(parsed.url)}</span>
      </div>
      <div class="parse-preview-row">
        <span class="parse-key">平台</span>
        <span class="parse-val">
          <span class="feed-platform feed-platform-${parsed.platform}">${platformLabels[parsed.platform]}</span>
        </span>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-sm" id="fillFormBtn">填入下方表单</button>
        <button class="btn btn-sm btn-soft" id="addDirectBtn">直接添加到列表</button>
      </div>
    </div>
  `;
}

function addFeedArticle() {
  const title = $('#feedTitleInput').value.trim();
  const url = $('#feedUrlInput').value.trim();
  const platform = $('#feedPlatformInput').value;
  const publishedAt = $('#feedDateInput').value || todayKey();
  if (!title) { showToast('请输入标题'); return; }
  if (!url) { showToast('请输入链接'); return; }
  if (!/^https?:\/\//i.test(url)) { showToast('链接必须以 http 开头'); return; }
  saveFeedArticle(title, url, platform, publishedAt);
  $('#feedTitleInput').value = '';
  $('#feedUrlInput').value = '';
  $('#feedDateInput').value = '';
  renderMain();
}

function saveFeedArticle(title, url, platform, publishedAt) {
  state.feedArticles.push({
    id: uid(),
    title,
    url,
    platform: platform || 'other',
    publishedAt: publishedAt || todayKey(),
    addedAt: todayKey()
  });
  persist();
  showToast('已添加：' + (title.length > 16 ? title.slice(0, 16) + '…' : title));
}

function deleteFeedArticle(id) {
  if (!confirm('删除这条收录？')) return;
  state.feedArticles = state.feedArticles.filter(a => a.id !== id);
  persist();
  renderMain();
}

function bulkImportFeed() {
  const raw = $('#feedBulkInput').value.trim();
  if (!raw) { showToast('请粘贴内容'); return; }
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  let added = 0, failed = 0;
  for (const line of lines) {
    // 优先级：尝试智能解析（可处理混合文本）
    let parsed = parseFeedText(line);
    if (parsed) {
      saveFeedArticle(parsed.title, parsed.url, parsed.platform, todayKey());
      added++;
      continue;
    }
    // 降级：尝试 | 分隔格式
    const parts = line.split('|').map(s => s.trim());
    if (parts.length >= 2 && /^https?:\/\//i.test(parts[1])) {
      saveFeedArticle(parts[0], parts[1], 'other', parts[2] || todayKey());
      added++;
      continue;
    }
    failed++;
  }
  $('#feedBulkInput').value = '';
  if (added > 0) showToast(`已导入 ${added} 条${failed > 0 ? `，跳过 ${failed} 条` : ''}`);
  else showToast('未识别到任何内容，请检查格式');
  renderMain();
}

/* ============== 攒钱 ============== */
function savingsBalance() {
  return (state.savings || []).reduce((s, r) =>
    s + (r.type === 'in' ? Number(r.amount) : -Number(r.amount)), 0);
}

function renderSavings() {
  const records = [...(state.savings || [])].sort((a, b) =>
    (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')
  );
  const balance = savingsBalance();
  const mKey = monthKey();
  const monthIn = records.filter(r => r.type === 'in' && r.date && r.date.startsWith(mKey))
    .reduce((s, r) => s + Number(r.amount), 0);
  const monthOut = records.filter(r => r.type === 'out' && r.date && r.date.startsWith(mKey))
    .reduce((s, r) => s + Number(r.amount), 0);

  return `
    <div class="savings-hero ${balance >= 0 ? 'positive' : 'negative'}">
      <div class="savings-hero-label">当前已攒</div>
      <div class="savings-hero-num">¥${fmtMoney(balance)}</div>
      <div class="savings-hero-meta">
        <span>本月攒入 <b class="up">+¥${fmtMoney(monthIn)}</b></span>
        <span>本月取出 <b class="down">-¥${fmtMoney(monthOut)}</b></span>
        <span>净增 <b>${monthIn - monthOut >= 0 ? '+' : ''}¥${fmtMoney(monthIn - monthOut)}</b></span>
      </div>
    </div>

    <div class="card">
      <div class="card-title">新增记录</div>
      <div class="card-sub">随时加入攒入或取出金额，永久保留全部历史</div>

      <div class="savings-type-row">
        <button class="savings-type savings-type-in active" data-type="in">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          攒入
        </button>
        <button class="savings-type savings-type-out" data-type="out">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          取出
        </button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <input type="number" step="0.01" inputmode="decimal" class="input" id="savingsAmountInput" placeholder="金额" />
        <input type="date" class="input" id="savingsDateInput" value="${todayKey()}" />
      </div>
      <input type="text" class="input" id="savingsNoteInput" placeholder="备注（可选，如：年终奖 / 应急取出）" style="margin-bottom:10px" />
      <button class="btn" id="addSavingsBtn" style="width:100%">记录下来</button>
    </div>

    <div class="card">
      <div class="card-title">流水记录 (${records.length})</div>
      <div class="card-sub">按日期倒序 · 绿色攒入 / 红色取出</div>
      ${records.length === 0 ?
        '<div class="feed-empty">还没有任何记录，先添加一笔吧</div>' :
        `<div class="savings-list">
          ${records.map(r => `
            <div class="savings-row" data-id="${r.id}">
              <div class="savings-row-left">
                <div class="savings-row-icon savings-row-icon-${r.type}">
                  ${r.type === 'in' ?
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' :
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>'}
                </div>
                <div class="savings-row-main">
                  <div class="savings-row-note">${r.note ? escapeHtml(r.note) : (r.type === 'in' ? '攒入' : '取出')}</div>
                  <div class="savings-row-date">${r.date || ''}</div>
                </div>
              </div>
              <div class="savings-row-amount savings-row-amount-${r.type}">
                ${r.type === 'in' ? '+' : '-'}¥${fmtMoney(r.amount)}
              </div>
              <button class="del-link" data-del-saving="${r.id}">删除</button>
            </div>
          `).join('')}
        </div>`}
    </div>
  `;
}

let savingsSelectedType = 'in';  // 默认攒入

function setSavingsType(t) {
  savingsSelectedType = t;
  $$('.savings-type').forEach(b => b.classList.toggle('active', b.dataset.type === t));
}

function addSaving() {
  const v = Number($('#savingsAmountInput').value);
  if (!v || v <= 0) { showToast('请输入有效金额'); return; }
  state.savings.push({
    id: uid(),
    type: savingsSelectedType,
    amount: v,
    note: $('#savingsNoteInput').value.trim(),
    date: $('#savingsDateInput').value || todayKey(),
    createdAt: new Date().toISOString()
  });
  persist();
  $('#savingsAmountInput').value = '';
  $('#savingsNoteInput').value = '';
  showToast(savingsSelectedType === 'in' ? `已攒入 ¥${v}` : `已取出 ¥${v}`);
  renderMain();
}

function deleteSaving(id) {
  if (!confirm('删除这条记录？')) return;
  state.savings = state.savings.filter(r => r.id !== id);
  persist();
  renderMain();
}

/* ============== 减肥计划（含目标体重） ============== */
function renderWeight() {
  const weights = [...state.weights].sort((a, b) => b.date.localeCompare(a.date));
  const latest = weights[0];
  const prev = weights[1];
  const goal = state.weightGoal;

  // 进度计算
  let goalPct = 0;
  let goalInfo = '';
  if (goal && latest) {
    // 假设从"开始体重"或首条记录算起，到当前体重的进度
    const startWeight = weights[weights.length - 1]?.value;
    if (startWeight && startWeight !== goal) {
      const total = Number(startWeight) - Number(goal);
      const done = Number(startWeight) - Number(latest.value);
      goalPct = Math.max(0, Math.min(100, Math.round(done / total * 100)));
      const remain = (Number(latest.value) - Number(goal)).toFixed(1);
      if (Number(latest.value) <= Number(goal)) {
        goalInfo = `🎉 已达成目标！`;
        goalPct = 100;
      } else {
        goalInfo = `距离目标还差 ${remain} kg`;
      }
    }
  }

  let trend = '';
  if (latest && prev) {
    const diff = (Number(latest.value) - Number(prev.value)).toFixed(1);
    if (Number(diff) < 0) trend = `<span class="down">↓ ${Math.abs(diff)} kg</span>`;
    else if (Number(diff) > 0) trend = `<span class="up">↑ ${Math.abs(diff)} kg</span>`;
    else trend = '<span>持平</span>';
  }

  const exercises = [...state.exercises].sort((a, b) => b.date.localeCompare(a.date));

  return `
    <div class="card">
      <div class="card-title">目标体重</div>
      <div class="card-sub">设定一个目标体重，系统自动追踪完成进度</div>

      <div class="goal-grid">
        <div class="goal-stat">
          <div class="goal-stat-label">当前体重</div>
          <div class="goal-stat-num">${latest ? latest.value : '--'}<span class="unit">kg</span></div>
          ${latest ? `<div class="weight-trend">较上次 ${trend}</div>` : ''}
        </div>
        <div class="goal-stat">
          <div class="goal-stat-label">目标体重</div>
          <div class="goal-stat-num">${goal ? goal : '--'}<span class="unit">kg</span></div>
          ${goal ? `<div class="weight-trend">${goalInfo}</div>` : '<div class="weight-trend" style="color:var(--text-light)">尚未设定</div>'}
        </div>
        <div class="goal-progress-wrap">
          <div class="goal-progress-num">${goal ? goalPct : '--'}<span class="unit">%</span></div>
          <div class="goal-progress-bar"><div class="goal-progress-fill" style="width:${goal ? goalPct : 0}%"></div></div>
          <div class="weight-trend" style="text-align:center;margin-top:6px">${goal ? '完成目标进度' : '请先设定目标体重'}</div>
        </div>
      </div>

      <div class="goal-form">
        ${goal ? `
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span style="font-size:12px;color:var(--text-sub)">目标已设为</span>
            <input type="number" step="0.1" class="input" id="goalInput" value="${goal}" style="width:140px" />
            <span style="font-size:12px;color:var(--text-sub)">kg</span>
            <button class="btn btn-sm btn-soft" id="saveGoalBtn">保存</button>
            <button class="btn btn-sm btn-danger" id="clearGoalBtn">清除目标</button>
          </div>
        ` : `
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span style="font-size:12px;color:var(--text-sub)">设定目标：</span>
            <input type="number" step="0.1" class="input" id="goalInput" placeholder="如 60" style="width:140px" />
            <span style="font-size:12px;color:var(--text-sub)">kg</span>
            <button class="btn btn-sm" id="saveGoalBtn">设定目标</button>
          </div>
        `}
      </div>
    </div>

    <div class="card">
      <div class="card-title">今日记录</div>
      <div class="card-sub">每日体重自动留存，运动项目永久保存</div>
      <div class="weight-grid">
        <div class="weight-input-card">
          <h4>今日体重</h4>
          ${latest ? `
            <div class="weight-big">${latest.value}<span class="unit">kg</span></div>
          ` : '<div class="weight-big">--<span class="unit">kg</span></div>'}
          <div class="acct-input-row" style="margin-top:14px">
            <input type="number" step="0.1" class="input" id="weightInput" placeholder="输入体重 kg" />
            <button class="btn" id="addWeightBtn">保存</button>
          </div>
        </div>

        <div class="exercise-input-card">
          <h4>今日运动</h4>
          <div class="acct-input-row" style="margin-bottom:10px">
            <input type="text" class="input" id="exerNameInput" placeholder="项目名称" />
            <input type="text" class="input" id="exerDurInput" placeholder="时长(分钟)" style="max-width:120px" />
          </div>
          <button class="btn btn-soft btn-sm" id="addExerBtn" style="width:100%">+ 添加运动</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">体重历史 (${state.weights.length})</div>
      <div class="weight-history">
        ${state.weights.length === 0 ?
          '<div style="color:var(--text-light);font-size:13px;padding:10px 0">暂无记录</div>' :
          `<table>
            <thead><tr><th>日期</th><th>体重 (kg)</th><th></th></tr></thead>
            <tbody>
              ${weights.map(w => `
                <tr>
                  <td>${w.date}</td>
                  <td>${w.value}</td>
                  <td><button class="del-link" data-del-weight="${w.id}">删除</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>`}
      </div>
    </div>

    <div class="card">
      <div class="card-title">运动历史 (${state.exercises.length})</div>
      <ul class="exercise-list">
        ${exercises.length === 0 ?
          '<li class="exercise-empty">暂无记录</li>' :
          exercises.slice(0, 30).map(e => `
            <li>
              <span>${escapeHtml(e.name)}</span>
              <span class="meta">${e.date} · ${e.duration} 分钟</span>
              <button class="del-link" data-del-exer="${e.id}">×</button>
            </li>
          `).join('')}
      </ul>
    </div>
  `;
}

/* ============== 事件绑定 ============== */
function bindMainEvents() {
  // 首页
  $('#addExpenseBtn')?.addEventListener('click', addExpense);
  $('#expenseInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addExpense(); });
  $('#saveBudgetBtn')?.addEventListener('click', () => {
    const v = Number($('#budgetInput').value);
    if (v > 0) {
      state.budget = v;
      persist();
      showToast('预算已更新');
      renderMain();
    }
  });

  $$('#statusRow .status-pill').forEach((b) => {
    b.addEventListener('click', () => {
      state.todayStatus = b.dataset.status;
      persist();
      renderMain();
    });
  });

  // 首页快速待办
  $$('#quickTodoList .todo-check').forEach((el) => {
    el.addEventListener('click', () => toggleTodo(todayKey(), el.dataset.quick));
  });

  // 总计划
  $('#addPlanBtn')?.addEventListener('click', addPlan);
  $('#planDescInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addPlan();
  });
  $('#goArchiveBtn')?.addEventListener('click', () => {
    state.currentView = 'plan-archive';
    renderSidebar();
    renderMain();
  });

  $$('input[data-progress]').forEach((el) => {
    el.addEventListener('input', () => {
      const stageId = el.dataset.progress;
      for (const p of state.plans) {
        const stage = (p.stages || []).find(s => s.id === stageId);
        if (stage) {
          stage.progress = Number(el.value);
          persist();
          el.nextElementSibling.textContent = `${stage.progress}%`;
          break;
        }
      }
    });
    el.addEventListener('change', renderMain);
  });
  $$('button[data-archive]').forEach((b) => {
    b.addEventListener('click', () => archivePlan(b.dataset.archive));
  });
  $$('button[data-del-plan]').forEach((b) => {
    b.addEventListener('click', () => deletePlan(b.dataset.delPlan));
  });
  $$('button[data-add-stage]').forEach((b) => {
    b.addEventListener('click', () => addStage(b.dataset.addStage));
  });
  $$('button[data-del-stage]').forEach((b) => {
    b.addEventListener('click', () => {
      const stageId = b.dataset.delStage;
      for (const p of state.plans) {
        if ((p.stages || []).some(s => s.id === stageId)) {
          deleteStage(p.id, stageId);
          break;
        }
      }
    });
  });
  $$('button[data-edit-stage]').forEach((b) => {
    b.addEventListener('click', () => {
      const stageId = b.dataset.editStage;
      for (const p of state.plans) {
        if ((p.stages || []).some(s => s.id === stageId)) {
          editStage(p.id, stageId);
          break;
        }
      }
    });
  });
  $$('[data-toggle-archive]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.toggleArchive;
      const body = $(`#archive-body-${id}`);
      if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
    });
  });
  $$('button[data-del-archive]').forEach((b) => {
    b.addEventListener('click', () => deleteArchived(b.dataset.delArchive));
  });

  // 当日待办
  $('#addTodoBtn')?.addEventListener('click', addTodo);
  $('#todoInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTodo(); });
  $$('div[data-toggle]').forEach((el) => {
    el.addEventListener('click', () => toggleTodo(todayKey(), el.dataset.toggle));
  });
  $$('button[data-del-todo]').forEach((b) => {
    b.addEventListener('click', () => deleteTodo(todayKey(), b.dataset.delTodo));
  });

  // 日历
  $$('.cal-day[data-day]').forEach((el) => {
    el.addEventListener('click', () => {
      state.calSelected = el.dataset.day;
      renderMain();
    });
  });
  $('#prevMonth')?.addEventListener('click', () => {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1);
    renderMain();
  });
  $('#nextMonth')?.addEventListener('click', () => {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1);
    renderMain();
  });

  // 模板
  $('#addTplBtn')?.addEventListener('click', addTpl);
  $('#tplInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTpl(); });
  $$('button[data-del-tpl]').forEach((b) => {
    b.addEventListener('click', () => deleteTpl(b.dataset.delTpl));
  });

// 投放资讯
  $('#addFeedBtn')?.addEventListener('click', addFeedArticle);
  $('#feedUrlInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addFeedArticle(); });
  $('#bulkImportBtn')?.addEventListener('click', bulkImportFeed);
  $$('button[data-del-feed]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.preventDefault();
      deleteFeedArticle(b.dataset.delFeed);
    });
  });

  // 智能粘贴实时解析
  const smartPaste = $('#smartPasteInput');
  if (smartPaste) {
    let lastParsed = null;
    const updatePreview = () => {
      const raw = smartPaste.value;
      const preview = $('#parsePreview');
      if (!raw.trim()) {
        preview.innerHTML = '';
        lastParsed = null;
        return;
      }
      const parsed = parseFeedText(raw);
      lastParsed = parsed;
      if (!parsed) {
        preview.innerHTML = '<div class="parse-preview parse-fail">未识别到链接，请确认粘贴内容里包含 http(s) 开头 URL</div>';
        return;
      }
      preview.innerHTML = renderParsePreview(parsed);
      $('#fillFormBtn')?.addEventListener('click', () => {
        if (!lastParsed) return;
        $('#feedTitleInput').value = lastParsed.title;
        $('#feedUrlInput').value = lastParsed.url;
        $('#feedPlatformInput').value = lastParsed.platform;
        showToast('已填入下方表单，请检查后点击"添加到列表"');
        $('#feedTitleInput').focus();
      });
      $('#addDirectBtn')?.addEventListener('click', () => {
        if (!lastParsed) return;
        saveFeedArticle(lastParsed.title, lastParsed.url, lastParsed.platform, todayKey());
        smartPaste.value = '';
        renderMain();
      });
    };
    smartPaste.addEventListener('input', updatePreview);
    smartPaste.addEventListener('paste', () => setTimeout(updatePreview, 10));
    updatePreview();
  }

// 减肥计划
  $('#addWeightBtn')?.addEventListener('click', addWeight);
  $('#weightInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addWeight(); });
  $('#addExerBtn')?.addEventListener('click', addExercise);
  $('#saveGoalBtn')?.addEventListener('click', saveWeightGoal);
  $('#clearGoalBtn')?.addEventListener('click', () => {
    if (!confirm('清除目标体重？')) return;
    state.weightGoal = null;
    persist();
    renderMain();
  });
  $$('button[data-del-weight]').forEach((b) => {
    b.addEventListener('click', () => deleteWeight(b.dataset.delWeight));
  });
  $$('button[data-del-exer]').forEach((b) => {
    b.addEventListener('click', () => deleteExercise(b.dataset.delExer));
  });

  // 攒钱
  $$('.savings-type').forEach((b) => {
    b.addEventListener('click', () => setSavingsType(b.dataset.type));
  });
  $('#addSavingsBtn')?.addEventListener('click', addSaving);
  $('#savingsAmountInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addSaving();
  });
  $$('button[data-del-saving]').forEach((b) => {
    b.addEventListener('click', () => deleteSaving(b.dataset.delSaving));
  });

  // 树洞
  $('#treeSetPasswordBtn')?.addEventListener('click', setTreeholePassword);
  $('#treeUnlockBtn')?.addEventListener('click', unlockTreehole);
  $('#treeChangePwBtn')?.addEventListener('click', changeTreeholePassword);
  $('#treeAddBtn')?.addEventListener('click', addTreeholePost);
  $$('button[data-del-tree]').forEach((b) => {
    b.addEventListener('click', () => deleteTreeholePost(b.dataset.delTree));
  });
  $('#treeLockBtn')?.addEventListener('click', () => {
    treeholeUnlocked = false;
    renderMain();
  });
}

/* ============== 业务函数 ============== */
function addExpense() {
  const input = $('#expenseInput');
  const v = Number(input.value);
  if (!v || v <= 0) { showToast('请输入有效金额'); return; }
  state.expenses.push({
    id: uid(),
    amount: v,
    date: todayKey(),
    note: ''
  });
  persist();
  input.value = '';
  showToast(`已记录 ¥${v}`);
  renderMain();
}

function addTodo() {
  const text = $('#todoInput').value.trim();
  if (!text) { showToast('请输入任务内容'); return; }
  const tplId = $('#tplSelect').value;
  const date = todayKey();
  if (!state.todoByDate[date]) state.todoByDate[date] = [];
  state.todoByDate[date].push({
    id: uid(),
    text,
    done: false,
    fromTpl: tplId || null
  });
  persist();
  $('#todoInput').value = '';
  $('#tplSelect').value = '';
  showToast('已添加');
  renderMain();
}

function toggleTodo(date, id) {
  const todos = state.todoByDate[date];
  if (!todos) return;
  const t = todos.find(x => x.id === id);
  if (t) {
    t.done = !t.done;
    persist();
    renderMain();
  }
}

function deleteTodo(date, id) {
  const todos = state.todoByDate[date];
  if (!todos) return;
  state.todoByDate[date] = todos.filter(x => x.id !== id);
  persist();
  renderMain();
}

function addTpl() {
  const name = $('#tplInput').value.trim();
  if (!name) { showToast('请输入模板名称'); return; }
  state.tplLib.push({ id: uid(), name });
  persist();
  $('#tplInput').value = '';
  showToast('模板已保存');
  renderMain();
}

function deleteTpl(id) {
  state.tplLib = state.tplLib.filter(x => x.id !== id);
  persist();
  renderMain();
}

function addPlan() {
  const t = $('#planTitleInput').value.trim();
  const d = $('#planDescInput').value.trim();
  if (!t) { showToast('请输入总计划名称'); return; }
  const now = new Date();
  state.plans.push({
    id: uid(),
    title: t,
    description: d,
    stages: [],
    createdAt: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  });
  persist();
  $('#planTitleInput').value = '';
  $('#planDescInput').value = '';
  showToast('总计划已创建');
  renderMain();
}

function addStage(planId) {
  const plan = state.plans.find(p => p.id === planId);
  if (!plan) return;
  const titleEl = document.querySelector(`[data-stage-title="${planId}"]`);
  const startEl = document.querySelector(`[data-stage-start="${planId}"]`);
  const endEl = document.querySelector(`[data-stage-end="${planId}"]`);
  const contentEl = document.querySelector(`[data-stage-content="${planId}"]`);
  const title = titleEl?.value.trim();
  const startDate = startEl?.value || '';
  const endDate = endEl?.value || '';
  const content = contentEl?.value.trim() || '';
  if (!title) { showToast('请输入阶段标题'); return; }
  if (!plan.stages) plan.stages = [];
  plan.stages.push({
    id: uid(),
    title,
    startDate,
    endDate,
    content,
    progress: 0
  });
  persist();
  showToast('阶段已添加');
  renderMain();
}

function deleteStage(planId, stageId) {
  const plan = state.plans.find(p => p.id === planId);
  if (!plan) return;
  if (!confirm('确认删除这个阶段？')) return;
  plan.stages = plan.stages.filter(s => s.id !== stageId);
  persist();
  renderMain();
}

function editStage(planId, stageId) {
  const plan = state.plans.find(p => p.id === planId);
  if (!plan) return;
  const stage = plan.stages.find(s => s.id === stageId);
  if (!stage) return;
  const newTitle = prompt('阶段标题', stage.title);
  if (newTitle === null) return;
  const newContent = prompt('阶段内容', stage.content || '');
  if (newContent === null) return;
  const newStart = prompt('开始日期 (YYYY-MM-DD)', stage.startDate || '');
  if (newStart === null) return;
  const newEnd = prompt('结束日期 (YYYY-MM-DD)', stage.endDate || '');
  if (newEnd === null) return;
  if (newTitle.trim()) stage.title = newTitle.trim();
  stage.content = newContent.trim();
  stage.startDate = newStart.trim();
  stage.endDate = newEnd.trim();
  persist();
  renderMain();
}

function archivePlan(id) {
  const p = state.plans.find(x => x.id === id);
  if (!p) return;
  p.archived = true;
  p.archivedAt = todayKey();
  state.archivedPlans.push({
    id: p.id,
    title: p.title,
    description: p.description,
    stages: p.stages,
    archivedAt: p.archivedAt
  });
  state.plans = state.plans.filter(x => x.id !== id);
  persist();
  showToast('已归档');
  renderMain();
}

function deletePlan(id) {
  if (!confirm('确认删除这个总计划（含所有阶段）？')) return;
  state.plans = state.plans.filter(x => x.id !== id);
  persist();
  renderMain();
}

function deleteArchived(id) {
  if (!confirm('彻底删除这条归档？')) return;
  state.archivedPlans = state.archivedPlans.filter(x => x.id !== id);
  persist();
  renderMain();
}

function addAccount() {
  const type = $('#feedType').value;
  const name = $('#feedName').value.trim();
  if (!name) { showToast('请输入账号'); return; }
  state.feedAccounts.push({
    id: uid(),
    type,
    name,
    addedAt: todayKey()
  });
  persist();
  $('#feedName').value = '';
  showToast('已绑定');
  renderMain();
}

function deleteFeedArticle(id) {
  if (!confirm('删除这条收录？')) return;
  state.feedArticles = state.feedArticles.filter(a => a.id !== id);
  persist();
  renderMain();
}

function addWeight() {
  const v = Number($('#weightInput').value);
  if (!v || v <= 0) { showToast('请输入有效体重'); return; }
  // 同一天多次记录，只保留最新
  const date = todayKey();
  state.weights = state.weights.filter(w => w.date !== date);
  state.weights.push({ id: uid(), value: v, date });
  persist();
  $('#weightInput').value = '';
  showToast('已保存');
  renderMain();
}

function deleteWeight(id) {
  state.weights = state.weights.filter(w => w.id !== id);
  persist();
  renderMain();
}

function addExercise() {
  const name = $('#exerNameInput').value.trim();
  const dur = $('#exerDurInput').value.trim();
  if (!name) { showToast('请输入运动项目'); return; }
  state.exercises.push({
    id: uid(),
    name,
    duration: dur || '未填',
    date: todayKey()
  });
  persist();
  $('#exerNameInput').value = '';
  $('#exerDurInput').value = '';
  showToast('已添加');
  renderMain();
}

function deleteExercise(id) {
  state.exercises = state.exercises.filter(x => x.id !== id);
  persist();
  renderMain();
}

function saveWeightGoal() {
  const v = Number($('#goalInput').value);
  if (!v || v <= 0) { showToast('请输入有效的目标体重'); return; }
  state.weightGoal = v;
  persist();
  showToast('目标已保存');
  renderMain();
}

/* ============== 树洞 ============== */
function setTreeholePassword() {
  const pw = $('#treeNewPwInput').value.trim();
  const pw2 = $('#treeNewPwConfirm').value.trim();
  if (!/^\d{4,8}$/.test(pw)) { showToast('请输入 4-8 位数字密码'); return; }
  if (pw !== pw2) { showToast('两次密码不一致'); return; }
  state.treehole.password = pw;
  treeholeUnlocked = true;
  persist();
  showToast('密码已设置，已自动解锁');
  renderMain();
}

function unlockTreehole() {
  const pw = $('#treePwInput').value.trim();
  if (!pw) { showToast('请输入密码'); return; }
  if (pw !== state.treehole.password) {
    showToast('密码错误');
    return;
  }
  treeholeUnlocked = true;
  persist();
  renderMain();
}

function changeTreeholePassword() {
  const oldPw = $('#treeOldPw').value.trim();
  const newPw = $('#treeNewPwInput').value.trim();
  const newPw2 = $('#treeNewPwConfirm').value.trim();
  if (oldPw !== state.treehole.password) { showToast('原密码错误'); return; }
  if (!/^\d{4,8}$/.test(newPw)) { showToast('新密码需 4-8 位数字'); return; }
  if (newPw !== newPw2) { showToast('两次新密码不一致'); return; }
  state.treehole.password = newPw;
  persist();
  showToast('密码已修改');
  renderMain();
}

function addTreeholePost() {
  const text = $('#treeContentInput').value.trim();
  const mood = $('#treeMoodSelect').value;
  if (!text) { showToast('请输入内容'); return; }
  if (!state.treehole.posts) state.treehole.posts = [];
  state.treehole.posts.unshift({
    id: uid(),
    content: text,
    mood,
    createdAt: new Date().toISOString()
  });
  persist();
  $('#treeContentInput').value = '';
  showToast('已记录');
  renderMain();
}

function deleteTreeholePost(id) {
  if (!confirm('删除这条树洞？')) return;
  state.treehole.posts = state.treehole.posts.filter(p => p.id !== id);
  persist();
  renderMain();
}

/* ============== 树洞渲染 ============== */
function renderTreehole() {
  const { password, posts = [] } = state.treehole;

  // 状态 1：未设置密码
  if (!password) {
    return `
      <div class="card lock-card">
        <div class="lock-icon">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <div class="lock-title">首次使用，请设置你的数字密码</div>
        <div class="lock-sub">4-8 位数字 · 仅保存在本地 · 忘记密码无法找回</div>
        <div class="lock-form">
          <input type="password" inputmode="numeric" pattern="[0-9]*" class="input lock-input" id="treeNewPwInput" placeholder="新密码（4-8 位数字）" />
          <input type="password" inputmode="numeric" pattern="[0-9]*" class="input lock-input" id="treeNewPwConfirm" placeholder="再次输入确认" />
          <button class="btn" id="treeSetPasswordBtn">设置密码并解锁</button>
        </div>
      </div>
    `;
  }

  // 状态 2：已设密码，未解锁
  if (!treeholeUnlocked) {
    return `
      <div class="card lock-card">
        <div class="lock-icon">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <div class="lock-title">请输入数字密码</div>
        <div class="lock-sub">只有你能看见这里的 ${posts.length} 条记录</div>
        <div class="lock-form">
          <input type="password" inputmode="numeric" pattern="[0-9]*" class="input lock-input" id="treePwInput" placeholder="输入密码" />
          <button class="btn" id="treeUnlockBtn">解锁</button>
        </div>
      </div>
    `;
  }

  // 状态 3：已解锁
  const moodLabels = { happy: '😊 开心', calm: '🍃 平静', sad: '🌧 难过', angry: '🔥 愤怒', tired: '😴 疲惫', confused: '🌀 迷茫' };
  return `
    <div class="card">
      <div class="card-title">
        写一条
        <button class="btn btn-sm btn-ghost" id="treeLockBtn" style="margin-left:auto">🔒 重新上锁</button>
      </div>
      <div class="card-sub">这里没有点赞、没有评论，只有你和自己的对话</div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <select class="input" id="treeMoodSelect" style="flex:0 0 140px">
          ${Object.entries(moodLabels).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
      </div>
      <textarea class="input" id="treeContentInput" placeholder="随便写点什么……" rows="3" style="resize:vertical;margin-bottom:10px"></textarea>
      <button class="btn" id="treeAddBtn">记录下来</button>
    </div>

    <div class="card">
      <div class="card-title">我的树洞 (${posts.length})</div>
      <div class="card-sub">按时间倒序展示 · 全部本地保存</div>
      ${posts.length === 0 ?
        '<div style="color:var(--text-light);padding:30px 0;text-align:center;font-size:13px">还没有记录，写下第一条吧</div>' :
        posts.map(p => {
          const d = new Date(p.createdAt);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          return `
            <div class="tree-post" data-id="${p.id}">
              <div class="tree-post-head">
                <span class="tree-mood">${moodLabels[p.mood] || '😊 开心'}</span>
                <span class="tree-time">${dateStr}</span>
                <button class="del-link" data-del-tree="${p.id}" style="margin-left:auto">删除</button>
              </div>
              <div class="tree-content">${escapeHtml(p.content)}</div>
            </div>
          `;
        }).join('')}
    </div>

    <div class="card">
      <div class="card-title">修改密码</div>
      <div class="card-sub">需输入原密码才能修改</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <input type="password" inputmode="numeric" pattern="[0-9]*" class="input" id="treeOldPw" placeholder="原密码" style="flex:1;min-width:120px" />
        <input type="password" inputmode="numeric" pattern="[0-9]*" class="input" id="treeNewPwInput" placeholder="新密码（4-8 位数字）" style="flex:1;min-width:120px" />
        <input type="password" inputmode="numeric" pattern="[0-9]*" class="input" id="treeNewPwConfirm" placeholder="再次输入新密码" style="flex:1;min-width:120px" />
      </div>
      <button class="btn btn-soft btn-sm" id="treeChangePwBtn">修改密码</button>
    </div>
  `;
}

/* ============== 移动端菜单 ============== */
function openMobileSidebar() {
  $('#sidebar').classList.add('open');
  $('#overlay').classList.add('show');
}
$('#hamburger').addEventListener('click', openMobileSidebar);
$('#overlay').addEventListener('click', () => {
  $('#sidebar').classList.remove('open');
  $('#overlay').classList.remove('show');
});

/* ============== 初始化 ============== */
renderSidebar();
renderMain();