const p=(id,x,y)=>({id,team:id.split('-')[0],type:id.split('-')[1][0],x,y});
const keepers=()=>[p('white-K',6,16),p('black-K',6,0)];
const move=(pieceId,x,y,freePawn=false)=>({type:'move',pieceId,x,y,...(freePawn?{freePawn:true}:{})});
const kick=(x,y)=>({type:'kick',x,y});
const skip=()=>({type:'skip'});
const goal=(kind,zone)=>({type:'possession',kind,zone,secureReplies:kind==='switch'?1:2});
const centre={x0:4,x1:10,y0:6,y1:10};
const position=(pieces,carrierId,phase='attackMove')=>({pieces:[...keepers(),...pieces],carrierId,phase,attack:'white'});

export const MIDFIELD_EXERCISES=[
  {
    id:'midfield-switch-open-side',title:'Find the open flank',difficulty:'easy',theme:'switch-play',side:'midfield',playerTeam:'white',roundLimit:3,planSteps:1,
    objective:'Switch to the marked far side and secure possession after the defender responds.',
    goal:goal('switch',{x0:9,x1:13,y0:6,y1:10}),
    coachNote:'The pressure is concentrated on the left. A horizontal delivery from b9 to the far-side rook on j9 moves the ball away from that pressure. End positioning and let the defender finish its reply before claiming the switch.',
    hints:['Compare the number of opponents near each flank.','The two rooks share the ninth rank.','One route is Rb9–Rj9, then end positioning. A controlled ball elsewhere in the marked area also counts.'],
    position:position([p('white-R1',1,8),p('white-R2',9,8),p('white-P1',3,9),p('black-Q',3,6),p('black-P1',2,7),p('black-R1',0,4)],'white-R1','kick'),
    exampleActions:[kick(9,8),skip()],
  },
  {
    id:'midfield-switch-clear-lane',title:'Clear the switching lane',difficulty:'medium',theme:'switch-play',side:'midfield',playerTeam:'white',roundLimit:3,planSteps:2,
    objective:'Open a route to the far side and keep the ball there through the reply.',
    goal:goal('switch',{x0:10,x1:13,y0:6,y1:10}),
    coachNote:'A teammate can block your own switch. Move the pawn off the ninth rank before sending the ball across. The opponent gets a full reply both before the delivery and after the far-side reception.',
    hints:['Your own pawn interrupts the direct passing lane.','Use its off-ball move or shared bonus to vacate the rank.','Try Pe9–e8, end positioning, then Rb9–Rk9 and end positioning again. Respond to the actual defensive arrangement.'],
    position:position([p('white-R1',1,8),p('white-R2',10,8),p('white-P1',4,8),p('white-B1',5,10),p('white-N1',7,11),p('black-N1',3,5),p('black-P1',2,3),p('black-R1',0,2)],'white-R1'),
    exampleActions:[move('white-P1',4,9),skip(),kick(10,8),skip()],
  },
  {
    id:'midfield-switch-through-pivot',title:'Switch through a moving pivot',difficulty:'tough',theme:'switch-play',side:'midfield',playerTeam:'white',roundLimit:4,planSteps:3,
    objective:'Use the central support to reach the marked opposite flank and retain control.',
    goal:goal('switch',{x0:10,x1:13,y0:4,y1:9}),
    coachNote:'The queen can receive centrally and change the passing angle with its own dribble. One continuation is Rb10–Qf10, Qf10–g9, then Qg9–Rk13. Secure the far-side receiver against the next full defensive reply.',
    hints:['A direct rook pass cannot reach the advanced far-side player.','A central receiver can change the angle after receiving.','Try Rb10–Qf10, Qg9, then Rk13. End positioning before the next kick and after the final reception.'],
    position:position([p('white-R1',1,7),p('white-Q',5,7),p('white-R2',10,4),p('white-B1',4,10),p('white-N1',7,11),p('white-P1',2,9),p('white-P2',8,10),p('black-R1',0,1),p('black-B1',10,6),p('black-Q',3,3),p('black-P1',4,5),p('black-P2',2,6)],'white-R1','kick'),
    exampleActions:[kick(5,7),move('white-Q',6,8),skip(),kick(10,4),skip()],
  },
  {
    id:'midfield-protect-leave-file',title:'Step off the pressure line',difficulty:'easy',theme:'protect-ball',side:'midfield',playerTeam:'white',roundLimit:3,planSteps:2,
    objective:'Keep the ball in midfield through two clean defensive replies.',
    goal:goal('protect',centre),
    coachNote:'Standing on the opposing rook’s file invites a tackle. Step the queen off that file, survive the reply, then use a teammate to move the point of pressure. The ball must stay inside the marked central area.',
    hints:['The opposing rook has a straight route toward the carrier.','A diagonal carry changes that relationship.','One route is Qg9–h8, then Qh8–Rk8. End positioning after each action to face the defender.'],
    position:position([p('white-Q',6,8),p('white-R1',10,9),p('white-P1',6,9),p('black-R1',6,4),p('black-P1',5,7),p('black-B1',2,8)],'white-Q'),
    exampleActions:[move('white-Q',7,9),skip(),kick(10,9),skip()],
  },
  {
    id:'midfield-protect-support-screen',title:'Protect the receiver with support',difficulty:'medium',theme:'protect-ball',side:'midfield',playerTeam:'white',roundLimit:3,planSteps:3,
    objective:'Use supporting movement to keep central possession through two clean replies.',
    goal:goal('protect',centre),
    coachNote:'Moving the queen alone leaves a pawn able to prepare a challenge with its bonus. Occupy the approach square with your own pawn while the queen steps away, then find a central outlet after the reply.',
    hints:['Inspect both the opponent’s ordinary move and its pawn bonus.','Your pawn can occupy the approach square without using the queen’s dribble.','One route is Qg9–h8 with Pf9–g9 as a bonus, then pass to Bj8. End positioning after the preparation and after the reception.'],
    position:position([p('white-Q',6,8),p('white-R1',4,9),p('white-P1',5,8),p('white-B1',9,9),p('black-P1',6,7),p('black-R1',6,3),p('black-B1',11,6),p('black-Q',2,6)],'white-Q'),
    exampleActions:[move('white-Q',7,9),move('white-P1',6,8,true),skip(),kick(9,9),skip()],
  },
  {
    id:'midfield-protect-crowded-centre',title:'Keep control in the crowd',difficulty:'tough',theme:'protect-ball',side:'midfield',playerTeam:'white',roundLimit:4,planSteps:4,
    objective:'Keep central possession through two clean replies while several opponents press.',
    goal:goal('protect',centre),
    coachNote:'Coordinate the carrier and its support. After stepping away from the initial press and covering the pawn approach, pass to a teammate that can carry out of the next challenge. Receiving and standing still are different decisions.',
    hints:['The first carrier needs both an escape square and a supporting screen.','The next receiver also has a separate dribble available.','Try Qg9–h8, Pf9–g9 as a bonus, then Qh8–Rj8; carry Rj8–j7 before ending positioning.'],
    position:position([p('white-Q',6,8),p('white-R1',9,9),p('white-B1',4,9),p('white-N1',5,10),p('white-P1',5,8),p('white-P2',8,7),p('black-R1',6,3),p('black-B1',11,6),p('black-Q',2,6),p('black-N1',10,7),p('black-P1',6,7),p('black-P2',3,8)],'white-Q'),
    exampleActions:[move('white-Q',7,9),move('white-P1',6,8,true),skip(),kick(9,9),move('white-R1',9,10),skip()],
  },
];
