'use strict';
/* CrazyGames HTML5 SDK v3 adapter. Game events are queued until init completes. */
(function () {
  function loadSdk() {
    if (window.CrazyGames && window.CrazyGames.SDK) {
      return Promise.resolve(window.CrazyGames.SDK);
    }
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
      script.onload = () => resolve(window.CrazyGames && window.CrazyGames.SDK);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  }

  const ready = loadSdk().then(async sdk => {
    if (!sdk || typeof sdk.init !== 'function') return null;
    await sdk.init();
    return sdk;
  }).catch(error => {
    console.warn('CrazyGames SDK unavailable; running standalone.', error);
    return null;
  });

  let queue = Promise.resolve();
  function gameEvent(name) {
    queue = queue.then(async () => {
      const sdk = await ready;
      if (!sdk || !sdk.game || typeof sdk.game[name] !== 'function') return;
      try {
        await sdk.game[name]();
      } catch (error) {
        console.warn('CrazyGames event failed:', name, error);
      }
    });
    return queue;
  }

  window.castleSDK = {
    ready,
    gameplayStart: () => gameEvent('gameplayStart'),
    gameplayStop: () => gameEvent('gameplayStop'),
    happytime: () => gameEvent('happytime'),
  };
})();
