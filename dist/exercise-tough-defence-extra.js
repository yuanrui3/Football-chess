/** Natural-keeper defensive studies. Outcome quality, never a route, earns credit. */
const piece=(id,x,y)=>({id,team:id.split('-')[0],type:id.split('-')[1][0],x,y});
const move=(pieceId,x,y,freePawn=false)=>({type:'move',pieceId,x,y,...(freePawn?{freePawn:true}:{})});
export const TOUGH_DEFENCE_EXTRA=[
  {
    id:'tough-open-the-keepers-return',title:'Cover the far post',difficulty:'tough',planSteps:3,revision:2,
    theme:'defence',side:'defence',playerTeam:'white',roundLimit:3,
    objective:'Win possession or hold the strongest available finishing chance to 10% or less. Any legal defensive plan can earn credit.',
    coachNote:'The goalkeeper begins centrally on g1. A rook can screen the i-file while the shared king bonus brings the keeper one file toward the far post; its later shot reaction supplies the final coverage. The knights and bishop contain the carrier, so the attacker has to confront the screen rather than receive a free central escape. This is one possible plan, not a required sequence.',
    hints:['The i-file is dangerous even though the keeper begins in a normal central position.','Coordinate a rook body block with the shared king bonus; the shot reaction is a separate action.','One plan is Rm4–i4, Kg1–h1 with the shared bonus, then Kh1–i1 against the declared I-file shot.'],
    goal:{type:'defend',maxOpponentShotXG:.10},
    position:{pieces:[piece('black-K',7,0),piece('black-Q',0,5),piece('black-B1',2,4),piece('black-N1',11,6),piece('black-P1',4,8),piece('black-R1',13,7),piece('black-R2',8,12),piece('white-Q',10,8),piece('white-R1',12,13),piece('white-B1',8,11),piece('white-N1',7,12),piece('white-N2',9,12),piece('white-P2',10,9),piece('white-K',6,16),piece('white-P1',6,15)],carrierId:'black-R2',phase:'defendMove',attack:'black'},
    exampleActions:[move('white-R1',8,13),move('white-K',7,16,true),move('white-K',8,16)],
  },
  {
    id:'tough-clear-the-box-gateway',title:'Bring the bishop across',difficulty:'tough',planSteps:3,revision:2,
    theme:'defence',side:'defence',playerTeam:'white',roundLimit:3,
    objective:'Win possession or hold the strongest available finishing chance to 10% or less. Any legal defensive plan can earn credit.',
    coachNote:'The keeper starts centrally on h1. The bishop can travel diagonally from d2 to provide a screen on f4, while the shared king bonus and the separate reaction cover the left-hand goal file. The surrounding defenders contain the rook and make the forward shot a real test of the prepared defence. Other legal plans meeting the same outcome also earn credit.',
    hints:['A straight attacking file can be screened by a bishop arriving diagonally.','Use the ordinary action for the bishop and the shared bonus for the king.','One plan is Bd2–f4, Kh1–g1 with the shared bonus, then Kg1–f1 against the declared F-file shot.'],
    goal:{type:'defend',maxOpponentShotXG:.10},
    position:{pieces:[piece('black-K',6,0),piece('black-Q',13,5),piece('black-B1',11,4),piece('black-N1',2,6),piece('black-P1',9,8),piece('black-R1',0,7),piece('black-R2',5,12),piece('white-Q',3,8),piece('white-B1',3,15),piece('white-B2',5,11),piece('white-N1',6,12),piece('white-N2',4,12),piece('white-P2',3,9),piece('white-K',7,16),piece('white-P1',7,15)],carrierId:'black-R2',phase:'defendMove',attack:'black'},
    exampleActions:[move('white-B1',5,13),move('white-K',6,16,true),move('white-K',5,16)],
  },
];
