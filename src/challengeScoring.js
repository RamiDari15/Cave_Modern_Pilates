// Pure scoring shared by tests and the server. Only completed class visits count.
export function classKind(name) {
  const text = String(name || '');
  if (/stretch/i.test(text)) return 'stretch';
  if (/signature|intro|intensified|power hour|ass\s*&\s*abs|yall?ah? move|reformer/i.test(text)) return 'reformer';
  return null;
}
export function scoreVisits(visits) {
  const daily = new Map();
  let reformerClasses = 0;
  for (const visit of [...visits].sort((a,b)=>a.start.localeCompare(b.start))) {
    if (!visit.kind || visit.cancelled) continue;
    const day = visit.start.slice(0,10);
    const item = daily.get(day) || { reformer: null, stretch: null, missed: [] };
    if (visit.missed) item.missed.push(visit.start);
    else if (visit.completed) {
      if (visit.kind === 'reformer') reformerClasses++;
      if (!item[visit.kind]) item[visit.kind] = visit.start;
    }
    daily.set(day,item);
  }
  const changes=[];
  for (const day of daily.values()) {
    if(day.reformer) changes.push({at:day.reformer,points:1});
    if(day.reformer && day.stretch) changes.push({at:day.reformer>day.stretch?day.reformer:day.stretch,points:1});
    for(const at of day.missed) changes.push({at,points:-1});
  }
  changes.sort((a,b)=>a.at.localeCompare(b.at));
  const points=changes.reduce((sum,item)=>sum+item.points,0);
  let running=0, reachedAt='';
  for(const change of changes){running+=change.points; if(running===points && !reachedAt) reachedAt=change.at;}
  return {points,reachedAt,reformerClasses,qualified:reformerClasses>=10};
}
