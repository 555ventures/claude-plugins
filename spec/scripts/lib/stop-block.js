'use strict'
// lib/stop-block.js — the one renderer of a look stop's approve/change block and the one copy of
// the picks decide script both chrome pages (design-atlas.js's atlas index, lib/review-page.js's
// journey review page) embed. specs/20260906/04-journey-review-page.md A1/D5: the review page
// renders the journey's open `journey-approved:<j>` stop through the SAME block and script the
// atlas uses (specs/20260905/01-picks-on-the-atlas-page.md D3(d)/(e) markup, D9's decide
// literals — `/__picks/decide`, `{id, by, verdict}`, the `/p/<name>` base rule, the
// `<!--picks-script-->` markers a `?clean` request strips), so a decision recorded from either
// page is byte-identical on disk.
//
// renderApproveStop(stop, opts?) — opts (all optional, every default is the atlas's own literal):
//   approveLabel/changeLabel  button text ("Approve"/"Change")
//   approveAttrs              extra attribute string on the approve button (e.g. `data-rv="approve" disabled title="…"`)
//   changeAttrs               extra attribute string on the change button
//   noteAttrs                 extra attribute string on the note textarea (e.g. a placeholder)
//   className                 the block's class ("stop")
//
// Does NOT: read or write picks.json (lib/mocks-picks.js), render a pick stop's compare table
// (that stays in design-atlas.js — it needs the mock files and the atlas's card markup), or
// decide anything itself.
//
// Exit codes: none — this is a library, not an executable.

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

function renderApproveStop(stop, opts) {
  const o = opts || {}
  const approveLabel = o.approveLabel != null ? o.approveLabel : 'Approve'
  const changeLabel = o.changeLabel != null ? o.changeLabel : 'Change'
  const approveAttrs = o.approveAttrs ? ' ' + o.approveAttrs : ''
  const changeAttrs = o.changeAttrs ? ' ' + o.changeAttrs : ''
  const noteAttrs = o.noteAttrs ? ' ' + o.noteAttrs : ''
  const className = o.className != null ? o.className : 'stop'
  const decided = stop.status === 'decided' && stop.decision
  const body = !decided
    ? '<button data-decide="approve"' + approveAttrs + '>' + esc(approveLabel) + '</button>' +
      '<textarea name="note-' + stop.id + '"' + noteAttrs + '></textarea>' +
      '<button data-decide="change"' + changeAttrs + '>' + esc(changeLabel) + '</button>'
    : stop.decision.verdict === 'approve'
      ? 'Approved by ' + esc(stop.decision.by)
      : esc(stop.decision.note)
  return '<div class="' + esc(className) + '" id="stop-' + stop.id + '" data-kind="approve" data-id="' + stop.id + '">' + body + '</div>'
}

// The page's own inline decide script — wrapped in HTML comment markers so a `?clean` request
// can strip it wholesale, exactly like the notes layer is skipped under ?clean. Base derivation,
// verdicts, and every literal below are pinned by AC-20260905-01-9.
const PICKS_SCRIPT = '<!--picks-script--><script>\n' +
  '(function(){\n' +
  "if (new URLSearchParams(location.search).has('clean')) return\n" +
  "var __pm = location.pathname.match(new RegExp('^/p/[^/]+'))\n" +
  "var __pbase = __pm ? __pm[0] : ''\n" +
  "function __esc(s){return String(s).replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]})}\n" +
  "function __author(){\n" +
  "  var a=null\n" +
  "  try{a=localStorage.getItem('nl-author')}catch(e){}\n" +
  "  if(a) return a\n" +
  "  var name=(window.prompt('Your name (shown on your notes)')||'').trim()||'anonymous'\n" +
  "  try{localStorage.setItem('nl-author',name)}catch(e){}\n" +
  "  return name\n" +
  "}\n" +
  "function __post(id,extra){\n" +
  "  var body=Object.assign({id:id,by:__author()},extra||{})\n" +
  "  return fetch(__pbase+'/__picks/decide',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})\n" +
  "    .then(function(r){return r.json().then(function(j){return {status:r.status,body:j}}).catch(function(){return {status:r.status,body:{}}})})\n" +
  "    .catch(function(){return {status:0,body:{error:'open the served atlas to decide'}}})\n" +
  "}\n" +
  "function __msg(el,text){\n" +
  "  var prev=el.querySelector('.decide-msg'); if(prev) prev.remove()\n" +
  "  var d=document.createElement('div'); d.className='decide-msg'; d.textContent=text\n" +
  "  el.appendChild(d)\n" +
  "}\n" +
  "function __renderPick(stopEl,stop){\n" +
  "  var heads=stopEl.querySelectorAll('.chead')\n" +
  "  heads.forEach(function(h){\n" +
  "    var g=h.getAttribute('data-group')\n" +
  "    var picked=stop.decision && stop.decision.pick===g\n" +
  "    h.className='chead '+(picked?'picked':'rejected')\n" +
  "    var badge=h.querySelector('.badge')\n" +
  "    if(badge){badge.className='badge '+(picked?'picked':'rejected');badge.textContent=picked?'picked':'rejected'}\n" +
  "    var btn=h.querySelector('[data-decide=\"pick\"]')\n" +
  "    if(btn) btn.textContent=picked?'Picked':'Pick this instead'\n" +
  "  })\n" +
  "  if(!stopEl.querySelector('[data-decide=\"why\"]')){\n" +
  "    var why=document.createElement('input'); why.name='why-'+stop.id; why.placeholder='why this one — optional'\n" +
  "    var save=document.createElement('button'); save.setAttribute('data-decide','why'); save.textContent='Save'\n" +
  "    stopEl.appendChild(why); stopEl.appendChild(save)\n" +
  "  }\n" +
  "}\n" +
  "function __renderApprove(stopEl,stop){\n" +
  "  stopEl.innerHTML = stop.decision.verdict==='approve' ? 'Approved by '+__esc(stop.decision.by) : __esc(stop.decision.note)\n" +
  "}\n" +
  "function __apply(stopEl,res){\n" +
  "  if(res.status===200){\n" +
  "    var stop=res.body\n" +
  "    if(stop.kind==='pick') __renderPick(stopEl,stop); else __renderApprove(stopEl,stop)\n" +
  "    return\n" +
  "  }\n" +
  "  if(res.status===409){ __msg(stopEl,'already picked up by the session'); return }\n" +
  "  if(res.status===0){ __msg(stopEl,res.body.error); return }\n" +
  "  __msg(stopEl,(res.body&&res.body.error)||'could not record the decision')\n" +
  "}\n" +
  "document.addEventListener('click',function(e){\n" +
  "  var btn=e.target.closest && e.target.closest('[data-decide]')\n" +
  "  if(!btn) return\n" +
  "  var kind=btn.getAttribute('data-decide')\n" +
  "  var stopEl=btn.closest('[data-id]')\n" +
  "  if(!stopEl) return\n" +
  "  var id=stopEl.getAttribute('data-id')\n" +
  "  if(kind==='pick'){\n" +
  "    __post(id,{verdict:'pick',pick:btn.getAttribute('data-group')}).then(function(res){__apply(stopEl,res)})\n" +
  "  } else if(kind==='why'){\n" +
  "    var input=stopEl.querySelector('[name=\"why-'+id+'\"]')\n" +
  "    var picked=stopEl.querySelector('.chead.picked')\n" +
  "    __post(id,{verdict:'pick',pick:picked?picked.getAttribute('data-group'):null,note:input?input.value:''}).then(function(res){__apply(stopEl,res)})\n" +
  "  } else if(kind==='approve'){\n" +
  "    __post(id,{verdict:'approve'}).then(function(res){__apply(stopEl,res)})\n" +
  "  } else if(kind==='change'){\n" +
  "    var ta=stopEl.querySelector('textarea[name=\"note-'+id+'\"]')\n" +
  "    var note=ta?ta.value.trim():''\n" +
  "    if(!note){ __msg(stopEl,'a change needs a note'); return }\n" +
  "    __post(id,{verdict:'change',note:note}).then(function(res){__apply(stopEl,res)})\n" +
  "  }\n" +
  "})\n" +
  // D4: opening a lightbox from a card inside a .cmp must walk only the SAME step's other
  // candidates, and the bar's Pick this must resolve the group from the card actually shown —
  // never a page-wide frame index or a chead-position guess. `.step` is a sibling of the cards,
  // not an ancestor, so the sibling set is read off each card's own data-step/data-group
  // attributes (emitted by renderCompareTable), scoped to this .cmp only. A page without a
  // lightbox (the review page) leaves both hooks untouched — the typeof guards below.
  "var __origOpen=window.__lbOpen\n" +
  "if(typeof __origOpen==='function'){\n" +
  "  window.__lbOpen=function(f){\n" +
  "    document.body.classList.add('lb-open')\n" +
  "    __origOpen(f)\n" +
  "    var card=f.closest && f.closest('.card')\n" +
  "    var cmp=card && card.closest('.cmp')\n" +
  "    if(cmp && card && card.dataset.step){\n" +
  "      var siblings=Array.prototype.slice.call(cmp.querySelectorAll('.card[data-step=\"'+card.dataset.step+'\"] iframe.frame'))\n" +
  "      if(siblings.length){ window.__lbList=siblings; window.__lbIx=siblings.indexOf(f) }\n" +
  "    }\n" +
  "    var bar=document.getElementById('lbbar')\n" +
  "    if(bar){\n" +
  "      var old=bar.querySelector('.decide-pick'); if(old) old.remove()\n" +
  "      if(cmp){\n" +
  "        var pb=document.createElement('button'); pb.className='decide-pick'; pb.textContent='Pick this'\n" +
  "        bar.insertBefore(pb, bar.lastChild)\n" +
  "        pb.onclick=function(){\n" +
  "          var curFrame=window.__lbList[window.__lbIx]\n" +
  "          var curCard=curFrame && curFrame.closest && curFrame.closest('.card')\n" +
  "          var g=curCard?curCard.dataset.group:null\n" +
  "          __post(cmp.getAttribute('data-id'),{verdict:'pick',pick:g}).then(function(res){__apply(cmp,res)})\n" +
  "        }\n" +
  "      }\n" +
  "    }\n" +
  "  }\n" +
  "}\n" +
  "var __origClose=window.__lbClose\n" +
  "if(typeof __origClose==='function'){\n" +
  "  window.__lbClose=function(){ document.body.classList.remove('lb-open'); __origClose() }\n" +
  "}\n" +
  '})()\n' +
  '</script><!--/picks-script-->'

function stripPicksScript(html) {
  return html.replace(/<!--picks-script-->[\s\S]*?<!--\/picks-script-->/g, '')
}

module.exports = { renderApproveStop, PICKS_SCRIPT, stripPicksScript, esc }
