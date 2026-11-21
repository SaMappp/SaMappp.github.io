/* Fixed layouts use world distances from the runner's starting position. */
window.DinoCourses = (function () {
  'use strict';

  var tracks = {
    dunes: {
      name: '沙丘连跳',
      description: '短跳、低飞翼龙和连续金币弧。',
      goal: '在矮仙人掌前短跳，落地后准备下蹲。',
      duration: 40, speed: 370, length: 4320, terrain: 0,
      events: [
        [510, 'arc'], [1080, 'small'], [1370, 'duck'], [1930, 'guard'],
        [2480, 'fork'], [3050, 'pair'], [3570, 'duck'], [4000, 'ground']
      ]
    },
    badlands: {
      name: '赤壁变速',
      description: '短距离连招、双障碍和交错飞行。',
      goal: '先减速看清翼龙高度，落地后再提速。',
      duration: 50, speed: 400, length: 5300, terrain: 1,
      events: [
        [530, 'fork'], [1110, 'guard'], [1490, 'duck'], [2060, 'pair'],
        [2550, 'low'], [3110, 'ground'], [3690, 'guard'], [4110, 'duck'],
        [4650, 'arc']
      ]
    },
    oasis: {
      name: '绿洲金币线',
      description: '多处金币岔路，适合追逐高连击。',
      goal: '在岔路提前选地面或空中，把选中的路线收完整。',
      duration: 45, speed: 360, length: 5000, terrain: 2,
      events: [
        [530, 'fork'], [1100, 'ground'], [1650, 'fork'], [2230, 'duck'],
        [2740, 'guard'], [3330, 'arc'], [3900, 'fork'], [4540, 'small']
      ]
    }
  };

  function get(id) {
    return Object.prototype.hasOwnProperty.call(tracks, id) ? tracks[id] : null;
  }

  function key(id, seconds) {
    return 'v1/' + id + '/' + seconds;
  }

  return {get: get, key: key};
})();
