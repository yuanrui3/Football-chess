const shortLandscape = matchMedia('(orientation: landscape) and (max-height: 600px) and (max-width: 1200px)');
const leftRail = '.game-layout > .left-panel, .exercise-library';
const rightRail = '.game-layout > .right-panel, .exercise-coach';

const placements = [
  ['.exercise-progress', leftRail, 'prepend'],
  ['body > .masthead', leftRail, 'prepend'],
  ['.pitch-area > .kick-details', rightRail, 'prepend'],
  ['.pitch-area > .computer-recap', rightRail, 'prepend'],
  ['.pitch-area > .pitch-caption', rightRail, 'prepend'],
  ['.pitch-area > .evaluation-controls', rightRail, 'prepend'],
  ['main > .match-toolbar', rightRail, 'prepend'],
  ['main > .scoreboard', rightRail, 'prepend'],
  ['.exercise-board-heading', rightRail, 'prepend'],
  ['.exercise-board-status', rightRail, 'append'],
  ['.exercise-board-tools', rightRail, 'append'],
  ['.exercise-evaluation-info', rightRail, 'append'],
  ['body > footer', rightRail, 'append'],
];

const blocks = placements.flatMap(([selector, rail, position]) => {
  const element = document.querySelector(selector);
  const destination = document.querySelector(rail);
  if (!element || !destination) return [];

  // Keep each block's place so portrait restores its original DOM order.
  const anchor = document.createComment('Portrait layout');
  element.before(anchor);
  return [{element, destination, position, anchor}];
});

function arrangeLayout() {
  const landscape = shortLandscape.matches;
  for (const {element, destination, position, anchor} of blocks) {
    if (landscape) destination[position](element);
    else anchor.after(element);
  }
  document.body.classList.toggle('landscape-layout', landscape);

  if (landscape) {
    // A portrait scroll offset can leave a goal offscreen after rotation.
    requestAnimationFrame(() => {
      if (shortLandscape.matches) window.scrollTo({top: 0, left: 0, behavior: 'instant'});
    });
  }
}

shortLandscape.addEventListener('change', arrangeLayout);
arrangeLayout();
