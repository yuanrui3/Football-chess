from pathlib import Path
import json, statistics, datetime, argparse
root=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--candidate',default='selected-heldout')
parser.add_argument('--control',default='baseline-heldout-blind')
parser.add_argument('--lock',default='selected-policy-lock.json')
parser.add_argument('--output',default='heldout-comparison')
args=parser.parse_args()
lock=json.loads((root/args.lock).read_text())
comparison=json.loads((root/'comparison-progress.json').read_text())
candidate=next((r for r in comparison['rows']if r['label']==args.candidate),None)
if not candidate:raise SystemExit('No completed candidate test leg yet.')
assert candidate['sha256']==lock['sha256'],'Candidate source changed after lock'
control=next(r for r in comparison['rows']if r['label']==args.control)
def load(label):return [json.loads(p.read_text())for p in sorted((root/label).glob('match-*.json'))]
def key(m):return(m['seed'],m['foulsEnabled'],m['candidateColor'],m['kickoff'])
new=load(candidate['label']);index={key(m):m for m in load(control['label'])};old=[index[key(m)]for m in new]
def aggregate(matches):
 out={k:0 for k in ['wins','draws','losses','goals','opponentGoals','shots','opponentShots','xG','opponentXG','stalls','offsides','nodes','maxNodes','actions','thinkMs','completedDepth']};timings=[]
 for m in matches:
  c=m['candidateColor'];b='black'if c=='white'else'white';s=m['stats'][c];o=m['stats'][b]
  out[{'win':'wins','draw':'draws','loss':'losses'}[m['candidateResult']]]+=1
  for a,k in [('goals','goals'),('shots','shots'),('xG','xG'),('stalls','stalls'),('offsides','offsides'),('nodes','nodes'),('actions','actions'),('thinkMs','thinkMs'),('completedDepth','completedDepthTotal')]:out[a]+=s[k]
  for a,k in [('opponentGoals','goals'),('opponentShots','shots'),('opponentXG','xG')]:out[a]+=o[k]
  out['maxNodes']=max(out['maxNodes'],s['maxNodes']);timings.extend(m['timings'][c])
 timings.sort();out['meanThinkMs']=out['thinkMs']/out['actions']if out['actions']else None;out['p95ThinkMs']=timings[int((len(timings)-1)*.95)]if timings else None
 out['meanCompletedDepth']=out['completedDepth']/out['actions']if out['actions']else None
 out['errors']=[{'key':key(m),'error':m['error'],'pendingShot':m['pendingShot'],'safetyLimitReached':m['safetyLimitReached']}for m in matches if m['error']or m['pendingShot']or m['safetyLimitReached']]
 goals=[next((e['step']for e in m.get('events',[])if e['result']['type']=='goal'and e['result']['team']==m['candidateColor']),None)for m in matches]
 out['firstGoalActions']=goals;out['scorelessLegs']=sum(x is None for x in goals);out['firstGoalMedianConditional']=statistics.median(x for x in goals if x is not None)if any(x is not None for x in goals)else None
 return out
n=len(new);a=aggregate(new);b=aggregate(old)
report={'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'complete'if n==candidate['planned']else'in progress','candidateLabel':args.candidate,'controlLabel':args.control,'sourceLock':lock,'completed':n,'planned':candidate['planned'],'seeds':candidate['seeds'],'foulsEnabled':True,'candidate':a,'frozenControl':b,'checkpoints':candidate['commonCheckpoints'],'pairedLegs':[{'key':key(m),'candidateResult':m['candidateResult'],'candidateScore':m['score'],'controlResult':index[key(m)]['candidateResult'],'controlScore':index[key(m)]['score']}for m in new]}
(root/f'evidence/{args.output}.json').write_text(json.dumps(report,indent=2)+'\n')
lines=['# Locked-policy held-out comparison','',f"Status: **{report['status']} ({n}/{candidate['planned']} candidate legs)**. Generated {report['generatedAt']}.",'',f"The candidate was locked at {lock['declaredLockAt']} with SHA-256 `{lock['sha256']}` before any frozen test outcomes were inspected. No policy retuning is included in this report.",'',
'Both policies are evaluated against the same frozen production Casual opponent, using exactly matched seed/color/kickoff legs. Actual transitions use the same production rules 19 / shot 15 module. Tactical uses 1,400 nodes/depth 8, learned weights are null, and fouls are enabled.','',
'| Policy | W/D/L | Goals | Shots | xG | Stalls | Mean/p95 decision ms | Max nodes |','|---|---:|---:|---:|---:|---:|---:|---:|']
for name,s in [('Frozen production Tactical',b),('Locked candidate',a)]:lines.append(f"| {name} | {s['wins']}/{s['draws']}/{s['losses']} | {s['goals']}–{s['opponentGoals']} | {s['shots']}–{s['opponentShots']} | {s['xG']:.3f}–{s['opponentXG']:.3f} | {s['stalls']} | {s['meanThinkMs']:.0f}/{s['p95ThinkMs']:.0f} | {s['maxNodes']} |")
lines+=['','Only the control legs matching the currently completed candidate legs appear above. The complete control has 8/8 legs; partial candidate results must not be presented as a final test.','','| Action checkpoint | Frozen goals | Candidate goals | Frozen shots/xG | Candidate shots/xG |','|---|---:|---:|---:|---:|']
for limit,pair in candidate['commonCheckpoints'].items():
 c=pair['candidate'];o=pair['control'];lines.append(f"| {limit} | {o['goalsFor']}–{o['goalsAgainst']} | {c['goalsFor']}–{c['goalsAgainst']} | {o['shotsFor']}–{o['shotsAgainst']} / {o['xGFor']:.3f}–{o['xGAgainst']:.3f} | {c['shotsFor']}–{c['shotsAgainst']} / {c['xGFor']:.3f}–{c['xGAgainst']:.3f} |")
lines+=['','## First goals and validation','',f"- Frozen first-goal actions: {b['firstGoalActions']}; conditional median {b['firstGoalMedianConditional']}; scoreless legs {b['scorelessLegs']}.",f"- Candidate first-goal actions: {a['firstGoalActions']}; conditional median {a['firstGoalMedianConditional']}; scoreless legs {a['scorelessLegs']}.",f"- Recorded legality/state/purity/node/horizon failures: frozen {len(b['errors'])}, candidate {len(a['errors'])}.",'','`null` first-goal entries mean the side did not score within that scenario. Conditional medians exclude them.','',
'## Limits','',
'The planned eight scenarios come from only two independent seeds; the four color/kickoff legs per seed are correlated. This is exploratory evidence, not a reliable general Elo estimate or proof of universal strength. All results here use fouls ON. No separate head-to-head tournament against frozen Tactical or fouls OFF tournament is claimed.','',
'Fixed-action horizons differ from a timed game. Roughly 200 actions fit a ten-minute/three-second pace before animation and clock effects. Computation overlapping the UI pause changes live pace independently of this fixed-action comparison. Different background CPU loads limit relative-speed claims. Earlier goals reset formations and change later cumulative xG trajectories.','',
'Final promotion/strength claim and final full-suite validation remain the parent task’s decision. See `selected-policy-lock.json`, per-batch configurations, immutable engine snapshots and individual match recordings for reproduction.']
s='\n'.join(lines)+'\n'
(root/f'evidence/{args.output}.md').write_text(s)
print(json.dumps({'status':report['status'],'completed':n,'planned':candidate['planned'],'candidate':{k:a[k]for k in ['wins','draws','losses','goals','opponentGoals','xG','opponentXG']},'control':{k:b[k]for k in ['wins','draws','losses','goals','opponentGoals','xG','opponentXG']}}))
