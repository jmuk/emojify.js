function getSize(header) {
    const sizeOffset = 124;
    const sizeLength = 12;
    var result = 0;
    for (var i = sizeOffset; i < Math.min(sizeOffset + sizeLength, header.length); ++i) {
        var c = header[i];
        if (c == 0)
            break;
        result = (result * 8) + c - 48;
    }
    return result;
}

function getName(header) {
    const nameLimit = 100;
    var index = 0;
    for (; index < Math.min(nameLimit, header.length); ++index) {
        if (header[index] == 0)
            break;
    }
    return (new TextDecoder('utf-8')).decode(header.subarray(0, index));
}

function storeToCache(cache, responses) {
    for (var name in responses) {
        var response = responses[name];
        cache.put(new Request(key), new Response(response));
    }
}

function untar(data) {
    const blockSize = 512;
    const nameLimit = 100;
    var index = 0;
    var results = {};
    console.log(data);
    while (index < data.byteLength) {
        console.log('processing block at ' + index);
        var header = new Uint8Array(data, index, blockSize);
        index += blockSize;
        var size = getSize(header);
        if (size == 0)
            continue;
        var name = getName(header);
        if (name.length == 0)
            continue;
        console.log(name + ': ' + size);
        var content = new Uint8Array(data, index, size);
        index += Math.ceil(size / blockSize) * blockSize;
        results[name] = content;
    }
    return results;
}

function fetch(url) {
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.responseType = 'arraybuffer';
        xhr.onreadystatechange = function() {
            if (xhr.readyState != 4)
                return;
            console.log(xhr.response.byteLength);
            resolve(xhr.response);
        };
        xhr.send();
   });
}

// While overkill for this specific sample in which there is only one cache,
// this is one best practice that can be followed in general to keep track of
// multiple caches used by a given service worker, and keep them all versioned.
// It maps a shorthand identifier for a cache to a specific, versioned cache name.

// Note that since global state is discarded in between service worker restarts, these
// variables will be reinitialized each time the service worker handles an event, and you
// should not attempt to change their values inside an event handler. (Treat them as constants.)

// If at any point you want to force pages that use this service worker to start using a fresh
// cache, then increment the CACHE_VERSION value. It will kick off the service worker update
// flow and the old cache(s) will be purged as part of the activate event handler when the
// updated service worker is activated.
var CACHE_VERSION = 1;
var CURRENT_CACHES = {
  images: 'images-cache-v' + CACHE_VERSION
};

self.addEventListener('install', function(event) {
  event.waitUntil(
    cache.open(CURRENT_CACHES['images']).then(function(cache) {
      fetch('images.tar').then(untar).then(storeToCache.bind(null, cache));
    }));
});

self.addEventListener('activate', function(event) {
  // Delete all caches that aren't named in CURRENT_CACHES.
  // While there is only one cache in this example, the same logic will handle the case where
  // there are multiple versioned caches.
  var expectedCacheNames = Object.keys(CURRENT_CACHES).map(function(key) {
    return CURRENT_CACHES[key];
  });

  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (expectedCacheNames.indexOf(cacheName) == -1) {
            // If this cache name isn't present in the array of "expected" cache names, then delete it.
            console.log('Deleting out of date cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', function(event) {
  console.log('Handling fetch event for', event.request.url);

  event.respondWith(
    caches.open(CURRENT_CACHES['images']).then(function(cache) {
      return cache.match(event.request).then(function(response) {
        if (response) {
          // If there is an entry in the cache for event.request, then response will be defined
          // and we can just return it. Note that in this example, only font resources are cached.
          console.log(' Found response in cache:', response);

          return response;
        }
      }).catch(function(error) {
        // This catch() will handle exceptions that arise from the match() or fetch() operations.
        // Note that a HTTP error response (e.g. 404) will NOT trigger an exception.
        // It will return a normal response object that has the appropriate error code set.
        console.error('  Error in fetch handler:', error);

        throw error;
      });
    })
  );
});