const VideoGallery = (function() {
    const galleries = new Map();
    const pendingLoads = new WeakMap();
    let initialized = false;

    function loadVideos(videos) {
        return Promise.all(Array.from(videos, video => {
            video.preload = 'auto';
            if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && !video.seeking) return video;
            if (pendingLoads.has(video)) return pendingLoads.get(video);

            const ready = new Promise((resolve, reject) => {
                function cleanup() {
                    video.removeEventListener('canplay', checkReady);
                    video.removeEventListener('seeked', checkReady);
                    video.removeEventListener('error', fail);
                }
                function checkReady() {
                    if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA || video.seeking) return;
                    cleanup();
                    resolve(video);
                }
                function fail() {
                    cleanup();
                    reject(video.error || new Error(`Cannot load ${video.currentSrc}`));
                }
                video.addEventListener('canplay', checkReady);
                video.addEventListener('seeked', checkReady);
                video.addEventListener('error', fail);
                if (video.error) fail();
                // Reusing the media element preserves its buffer; load only an uninitialized one.
                else if (video.networkState === HTMLMediaElement.NETWORK_EMPTY) video.load();
                else checkReady();
            }).finally(() => pendingLoads.delete(video));
            pendingLoads.set(video, ready);
            return ready;
        }));
    }

    function syncVideos(gallery, videos) {
        cancelAnimationFrame(gallery.animationFrameId);
        gallery.animationFrameId = null;
        if (videos.length < 2) return;
        const [primary, ...others] = videos;
        function checkSync() {
            if (!gallery.visible || document.hidden || primary.paused) return;
            others.forEach(video => {
                // Allow normal frame timing differences instead of seeking every frame.
                if (!video.paused && !video.seeking && video.readyState >= 3 &&
                    Math.abs(primary.currentTime - video.currentTime) > 0.12) {
                    video.currentTime = primary.currentTime;
                }
            });
            gallery.animationFrameId = requestAnimationFrame(checkSync);
        }
        gallery.animationFrameId = requestAnimationFrame(checkSync);
    }

    function preloadNext(gallery) {
        if (!gallery.nearby || gallery.sets.length < 2) return;
        const nextIndex = (gallery.activeIndex + 1) % gallery.sets.length;
        const videos = [...gallery.sets[nextIndex].querySelectorAll('video')];
        videos.forEach(video => {
            if (video.currentTime !== 0) video.currentTime = 0;
        });
        loadVideos(videos).catch(error => console.warn('Video preloading failed:', error));
    }

    function updateDots(gallery) {
        const dots = document.getElementById(`${gallery.id}-dots`);
        if (!dots) return;
        [...dots.children].forEach((dot, index) => {
            dot.classList.toggle('active', index === gallery.activeIndex);
        });
    }

    async function handleVideoSwitch(gallery, index, restart = true) {
        index = (index + gallery.sets.length) % gallery.sets.length;
        gallery.requestedIndex = index;
        const version = ++gallery.version;
        if (!gallery.visible || document.hidden) return;
        gallery.pending = true;
        gallery.container.classList.add('is-loading');
        const selectedSet = gallery.sets[index];
        const videos = [...selectedSet.querySelectorAll('video')];

        try {
            if (restart || index !== gallery.activeIndex) {
                videos.forEach(video => {
                    video.pause();
                    if (video.currentTime !== 0) video.currentTime = 0;
                });
            }
            await loadVideos(videos);
            if (version !== gallery.version) return;

            // Reveal the incoming video only once playback has started.
            await Promise.all(videos.map(video => video.play()));
            if (version !== gallery.version) {
                if (index !== gallery.activeIndex && index !== gallery.requestedIndex) {
                    videos.forEach(video => video.pause());
                }
                return;
            }
            gallery.sets.forEach((set, setIndex) => {
                set.classList.toggle('active', setIndex === index);
                if (setIndex !== index) set.querySelectorAll('video').forEach(video => video.pause());
            });
            gallery.activeIndex = index;
            gallery.pending = false;
            gallery.container.classList.remove('is-loading');
            updateDots(gallery);
            syncVideos(gallery, videos);
            preloadNext(gallery);
        } catch (error) {
            if (version !== gallery.version) return;
            gallery.pending = false;
            gallery.container.classList.remove('is-loading');
            gallery.requestedIndex = gallery.activeIndex;
            if (index !== gallery.activeIndex) videos.forEach(video => video.pause());
            // Autoplay denial or an interrupted play should not trigger an endless retry loop.
            if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
                console.error('Video playback failed:', error);
            }
        }
    }

    function pauseGallery(gallery) {
        gallery.version += 1;
        gallery.pending = false;
        gallery.container.classList.remove('is-loading');
        cancelAnimationFrame(gallery.animationFrameId);
        gallery.animationFrameId = null;
        gallery.container.querySelectorAll('video').forEach(video => video.pause());
    }

    const visibilityObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            const gallery = galleries.get(entry.target.id);
            gallery.visible = entry.isIntersecting;
            if (gallery.visible && !document.hidden) {
                handleVideoSwitch(gallery, gallery.requestedIndex, false);
            } else {
                pauseGallery(gallery);
            }
        });
    }, { threshold: 0 });

    const preloadObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            const gallery = galleries.get(entry.target.id);
            gallery.nearby = entry.isIntersecting;
            if (!gallery.nearby || document.hidden) return;
            loadVideos(gallery.sets[gallery.activeIndex].querySelectorAll('video'))
                .then(() => { if (!gallery.pending) preloadNext(gallery); })
                .catch(error => console.warn('Video preloading failed:', error));
        });
    }, { rootMargin: '500px 0px' });

    function initGallery(container) {
        const sets = [...container.querySelectorAll('.video-single, .video-pair, .video-triple')];
        if (!sets.length) return;
        const activeIndex = Math.max(0, sets.findIndex(set => set.classList.contains('active')));
        const gallery = {
            id: container.id, container, sets, activeIndex, requestedIndex: activeIndex,
            version: 0, pending: false, visible: false, nearby: false, animationFrameId: null,
        };
        galleries.set(gallery.id, gallery);
        sets.forEach((set, index) => {
            set.classList.toggle('active', index === activeIndex);
            const videos = [...set.querySelectorAll('video')];
            videos.forEach(video => {
                video.muted = true;
                video.playsInline = true;
                video.loop = false;
                video.autoplay = false;
                const showVideo = () => video.classList.add('is-ready');
                const hideVideo = () => video.classList.remove('is-ready');
                video.addEventListener('canplay', showVideo);
                video.addEventListener('playing', showVideo);
                video.addEventListener('waiting', hideVideo);
                video.addEventListener('emptied', hideVideo);
                if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) showVideo();
            });
            videos[0].addEventListener('ended', () => {
                if (gallery.visible && !document.hidden && !gallery.pending && gallery.activeIndex === index) {
                    handleVideoSwitch(gallery, index + 1);
                }
            });
            videos[0].addEventListener('play', () => {
                if (gallery.activeIndex === index && !gallery.pending) syncVideos(gallery, videos);
            });
        });

        const dots = document.getElementById(`${gallery.id}-dots`);
        if (dots) {
            dots.replaceChildren();
            sets.forEach((_, index) => {
                const dot = document.createElement('span');
                dot.className = 'gallery-dot';
                dot.addEventListener('click', () => handleVideoSwitch(gallery, index));
                dots.appendChild(dot);
            });
            updateDots(gallery);
        }
        document.getElementById(`${gallery.id}-prev`)?.addEventListener('click', () => {
            handleVideoSwitch(gallery, gallery.requestedIndex - 1);
        });
        document.getElementById(`${gallery.id}-next`)?.addEventListener('click', () => {
            handleVideoSwitch(gallery, gallery.requestedIndex + 1);
        });
        visibilityObserver.observe(container);
        preloadObserver.observe(container);
    }

    function updateVisibility() {
        galleries.forEach(gallery => {
            if (document.hidden) pauseGallery(gallery);
            else if (gallery.visible) handleVideoSwitch(gallery, gallery.requestedIndex, false);
        });
    }

    return {
        init() {
            if (initialized) return;
            initialized = true;
            document.querySelectorAll('.video-gallery-carousel').forEach(initGallery);
            document.addEventListener('visibilitychange', updateVisibility);
        },
        cleanup() {
            visibilityObserver.disconnect();
            preloadObserver.disconnect();
            galleries.forEach(pauseGallery);
            document.removeEventListener('visibilitychange', updateVisibility);
        },
    };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', VideoGallery.init);
} else {
    VideoGallery.init();
}
window.addEventListener('unload', VideoGallery.cleanup);
