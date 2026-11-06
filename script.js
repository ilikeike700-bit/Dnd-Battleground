// Wrap the program in a function that runs immediately and keeps its variables private.
(function(){
// Helper function: $ finds an HTML element by its id. The next values prepare the drawing canvas.
const $=id=>document.getElementById(id),c=$('board'),ctx=c.getContext('2d'),CELL=48;
// Each creature team has a color used when drawing its token.
const colors={player:'#66b9e8',ally:'#79c6a0',enemy:'#e47b73',neutral:'#b8a2dc'};
// Live game data: grid size, creatures, terrain, selected creature, turn order, and interaction modes.
let cols=18,rows=14,units=[],terrain=new Set(),selected=null,active=null,round=0,turn=-1,combat=false,measure=false,picks=[],terrainMode=false,drag=null;

// localStorage is browser storage that keeps data on this device between visits.
// This key is the name used to find this battle saved data.
const STORAGE_KEY = 'initiativeBattleGrid_v1';
// Save the current battle as JSON (a text format for structured data) in this browser.
function saveState(){
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      cols, rows, units, terrain:[...terrain], combat, round, turn,
      activeIndex: units.indexOf(active), selectedIndex: units.indexOf(selected)
    }));
  } catch (error) {
    console.warn('Could not save the battle grid in this browser.', error);
  }
}
// Read saved data when the page opens and restore the grid, creatures, and combat status.
function loadState(){
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const data = JSON.parse(saved);
    if (!data || !Array.isArray(data.units) || !Array.isArray(data.terrain)) return;
    cols = Math.max(8, Math.min(30, Number(data.cols) || 18));
    rows = Math.max(8, Math.min(24, Number(data.rows) || 14));
    units = data.units.filter(u => u && typeof u.name === 'string').map(u => ({
      name:u.name, team:colors[u.team] ? u.team : 'neutral',
      speed:Math.max(0, Number(u.speed) || 0), init:Number(u.init) || 0,
      size:[1,2,3].includes(Number(u.size)) ? Number(u.size) : 1,
      x:Math.max(0, Number(u.x) || 0), y:Math.max(0, Number(u.y) || 0),
      spent:Math.max(0, Number(u.spent) || 0)
    }));
    terrain = new Set(data.terrain.filter(k => typeof k === 'string'));
    combat = Boolean(data.combat) && units.length > 0;
    round = Math.max(0, Number(data.round) || 0);
    turn = units.length ? Math.max(0, Math.min(units.length-1, Number(data.turn) || 0)) : -1;
    active = combat ? units[Math.max(0, Math.min(units.length-1, Number(data.activeIndex) || 0))] : null;
    selected = units.length && Number.isInteger(data.selectedIndex) && data.selectedIndex >= 0
      ? units[Math.min(units.length-1, data.selectedIndex)] : active;
    c.width = cols*CELL;
    c.height = rows*CELL;
    $('grid').textContent = 'Grid: '+cols+' × '+rows;
  } catch (error) {
    console.warn('Could not restore the saved battle grid.', error);
  }
}

// Turn a grid coordinate into a text label so terrain squares can be stored in a Set (a collection of unique values).
const key=(x,y)=>x+','+y;
// Display a brief notification message on the page.
function toast(s){$('toast').textContent=s;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),1400)}
// Check whether a creature would overlap another creature at a proposed position.
function occupied(x,y,except,size){return units.some(u=>u!==except&&x<u.x+u.size&&x+size>u.x&&y<u.y+u.size&&y+size>u.y)}
// Find the first open grid position large enough for a new creature.
function spot(size){for(let y=0;y<=rows-size;y++)for(let x=0;x<=cols-size;x++)if(!occupied(x,y,null,size))return{x,y};return{x:0,y:0}}
// Draw the background, difficult terrain, grid lines, creature tokens, and selection outlines on the canvas.
function draw(){ctx.fillStyle='#101820';ctx.fillRect(0,0,c.width,c.height);terrain.forEach(k=>{let p=k.split(',').map(Number);ctx.fillStyle='#66583b';ctx.fillRect(p[0]*CELL,p[1]*CELL,CELL,CELL);ctx.strokeStyle='#9d8757';for(let i=-CELL;i<CELL*2;i+=10){ctx.beginPath();ctx.moveTo(p[0]*CELL+i,p[1]*CELL);ctx.lineTo(p[0]*CELL+i+CELL,p[1]*CELL+CELL);ctx.stroke()}});
ctx.strokeStyle='#34424d';for(let x=0;x<=cols;x++){ctx.beginPath();ctx.moveTo(x*CELL,0);ctx.lineTo(x*CELL,rows*CELL);ctx.stroke()}for(let y=0;y<=rows;y++){ctx.beginPath();ctx.moveTo(0,y*CELL);ctx.lineTo(cols*CELL,y*CELL);ctx.stroke()}
units.forEach(u=>{let x=u.x*CELL,y=u.y*CELL,w=u.size*CELL;ctx.fillStyle='#17232c';ctx.strokeStyle=u===selected?'#f1c66c':colors[u.team];ctx.lineWidth=u===selected?3:2;ctx.beginPath();ctx.roundRect(x+3,y+3,w-6,w-6,8);ctx.fill();ctx.stroke();ctx.fillStyle=colors[u.team];ctx.beginPath();ctx.arc(x+w/2,y+w/2-4,Math.min(12,w/4),0,7);ctx.fill();ctx.fillStyle='#101820';ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.fillText(u.name.slice(0,2).toUpperCase(),x+w/2,y+w/2);ctx.fillStyle='#fff';ctx.font='10px system-ui';ctx.fillText(u.name.slice(0,12),x+w/2,y+w-10);if(u===active){ctx.strokeStyle='#f1c66c';ctx.setLineDash([4,3]);ctx.strokeRect(x+1,y+1,w-2,w-2);ctx.setLineDash([])}});picks.forEach(u=>{ctx.strokeStyle='#f1c66c';ctx.lineWidth=3;ctx.strokeRect(u.x*CELL+2,u.y*CELL+2,u.size*CELL-4,u.size*CELL-4)})}
// Refresh the visible page using the latest game data, then save the data automatically.
function render(){draw();$('roster').innerHTML='';[...units].sort((a,b)=>b.init-a.init).forEach(u=>{let d=document.createElement('div');d.className='unit'+(u===selected?' sel':'');let dot=document.createElement('i');dot.className='dot';dot.style.background=colors[u.team];let span=document.createElement('span'),b=document.createElement('b'),sm=document.createElement('small'),right=document.createElement('small');b.textContent=u.name;sm.textContent=u.init+' init · '+u.speed+' ft';right.textContent=u===active?'NOW':(u.x+1)+','+(u.y+1);span.append(b,sm);d.append(dot,span,right);d.onclick=()=>{selected=u;render()};$('roster').append(d)});
let u=selected;$('edit').disabled=!u;$('remove').disabled=!u;$('selectedInfo').textContent=u?u.name+' · '+u.team+' | Speed '+u.speed+' ft | Position '+(u.x+1)+','+(u.y+1)+' | Used '+u.spent+' ft | Remaining '+Math.max(0,u.speed-u.spent)+' ft':'Select a creature on the map or in the roster.';
$('round').textContent=combat?round:'—';$('turnlabel').textContent=combat?'Turn '+(turn+1)+' of '+units.length:'Combat not started';$('activeName').textContent=active?active.name:'No active turn';let rem=active?Math.max(0,active.speed-active.spent):0;$('remaining').textContent=active?'Movement remaining: '+rem+' / '+active.speed+' ft':'Movement remaining: —';$('bar').style.width=active?100*rem/Math.max(1,active.speed)+'%':'0';$('start').disabled=combat||!units.length;$('next').disabled=!combat||!units.length;saveState()}
// Read the form and create a new creature in the first available grid space.
function add(){let name=$('name').value.trim();if(!name)return toast('Enter a name');let size=+$('size').value,p=spot(size),u={name,team:$('team').value,speed:Math.max(0,+$('speed').value||0),init:+$('initiative').value||0,size,x:p.x,y:p.y,spent:0};units.push(u);selected=u;$('name').value='';render()}
// Find and return the creature occupying the grid square at these coordinates, if there is one.
function hit(x,y){return units.find(u=>x>=u.x&&x<u.x+u.size&&y>=u.y&&y<u.y+u.size)}
// Move a creature after checking boundaries, collisions, turn order, and remaining movement.
// Each square costs 10 feet; diagonal movement is simplified to 10 feet per square here.
function move(u,x,y){if(x<0||y<0||x+u.size>cols||y+u.size>rows||occupied(x,y,u,u.size))return toast('Space unavailable');if(combat&&u!==active)return toast('Not this creature’s turn');let steps=Math.max(Math.abs(x-u.x),Math.abs(y-u.y)),cost=steps*10;for(let i=1;i<=steps;i++){let tx=u.x+Math.round((x-u.x)*i/steps),ty=u.y+Math.round((y-u.y)*i/steps);if(terrain.has(key(tx,ty)))cost+=10}if(combat&&cost>u.speed-u.spent)return toast('Not enough movement remaining');if(combat)u.spent+=cost;u.x=x;u.y=y;selected=u;render();if(combat)toast('Moved '+cost+' ft')}
// Listen for a pointer press on the battlefield (mouse, touch, or pen) to select, measure, or edit terrain.
c.addEventListener('pointerdown',e=>{let r=c.getBoundingClientRect(),x=Math.floor((e.clientX-r.left)*c.width/r.width/CELL),y=Math.floor((e.clientY-r.top)*c.height/r.height/CELL),u=hit(x,y);if(terrainMode){let k=key(x,y);terrain.has(k)?terrain.delete(k):terrain.add(k);saveState();draw();return}if(measure){if(u){picks.push(u);if(picks.length===2){let a=picks[0],b=picks[1],d=Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))*10;$('distanceInfo').textContent=a.name+' to '+b.name+': '+d+' ft ('+d/10+' squares).';picks=[];measure=false;$('measure').textContent='↔ Measure'}}draw();return}if(u){selected=u;drag={u,ox:x-u.x,oy:y-u.y};render()}else{selected=null;render()}});
// When the pointer is released, calculate the destination and finish dragging the creature.
c.addEventListener('pointerup',e=>{if(!drag)return;let r=c.getBoundingClientRect(),x=Math.floor((e.clientX-r.left)*c.width/r.width/CELL)-drag.ox,y=Math.floor((e.clientY-r.top)*c.height/r.height/CELL)-drag.oy;if(x!==drag.u.x||y!==drag.u.y)move(drag.u,x,y);drag=null});
// Connect interface buttons to actions such as adding, editing, removing, sorting, and clearing creatures.
$('add').onclick=add;$('remove').onclick=()=>{units=units.filter(u=>u!==selected);if(active===selected)active=null;selected=null;render()};$('edit').onclick=()=>{if(!selected)return;let n=prompt('Name',selected.name),s=prompt('Speed in feet',selected.speed);if(n!==null)selected.name=n.trim()||selected.name;if(s!==null)selected.speed=Math.max(0,+s||0);render()};
$('sort').onclick=()=>{units.sort((a,b)=>b.init-a.init);if(combat)turn=units.indexOf(active);render()};$('clear').onclick=()=>{if(confirm('Clear all creatures and terrain?')){units=[];terrain.clear();selected=active=null;combat=false;turn=-1;round=0;render()}};
// Start combat by sorting initiative and activating the first creature's turn.
$('start').onclick=()=>{units.sort((a,b)=>b.init-a.init);combat=true;round=1;turn=0;active=units[0];units.forEach(u=>u.spent=0);selected=active;render()};
// Advance to the next creature; completing the list starts a new round.
$('next').onclick=()=>{turn=(turn+1)%units.length;if(turn===0)round++;active=units[turn];active.spent=0;selected=active;render()};
// Toggle distance mode, which measures between two creatures clicked on the grid.
$('measure').onclick=()=>{measure=!measure;picks=[];$('measure').textContent=measure?'Click two tokens…':'↔ Measure';$('distanceInfo').textContent=measure?'Click two creatures on the grid.':'Choose Measure, then click two creatures.'};
// Toggle terrain-editing mode so clicked squares become or stop being difficult terrain.
$('terrain').onclick=()=>{terrainMode=!terrainMode;$('terrain').textContent='Difficult terrain: '+(terrainMode?'ON':'off');toast(terrainMode?'Click squares to toggle terrain':'Terrain mode off')};
// Ask for grid dimensions, limit them to supported sizes, and redraw the battlefield.
$('grid').onclick=()=>{let w=prompt('Grid width',cols),h=prompt('Grid height',rows);if(w!==null&&h!==null){cols=Math.max(8,Math.min(30,+w||18));rows=Math.max(8,Math.min(24,+h||14));// Set the drawing area size, restore any saved battle, and render the initial page.
c.width=cols*CELL;c.height=rows*CELL;$('grid').textContent='Grid: '+cols+' × '+rows;saveState();draw()}};
c.width=cols*CELL;c.height=rows*CELL;loadState();render();
})();
