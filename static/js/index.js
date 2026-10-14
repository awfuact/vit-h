window.HELP_IMPROVE_VIDEOJS = false;

document.addEventListener('DOMContentLoaded', function() {
    const navigation = document.querySelector('.project-nav');
    const abstract = document.querySelector('#abstract');
    function updateNavigationVisibility() {
        // Match the anchor offset so clicking Explore reveals navigation too.
        const reachedAbstract = abstract.getBoundingClientRect().top <= navigation.getBoundingClientRect().height + 1;
        navigation.classList.toggle('is-visible', reachedAbstract);
    }
    function updateNavigationHeight() {
        document.documentElement.style.setProperty('--nav-height', `${navigation.getBoundingClientRect().height}px`);
        updateNavigationVisibility();
    }
    // Keep the first screen and anchor offsets aligned when navigation wraps or fonts load.
    new ResizeObserver(updateNavigationHeight).observe(navigation);
    window.addEventListener('scroll', updateNavigationVisibility, { passive: true });
    window.addEventListener('resize', updateNavigationVisibility);
    updateNavigationHeight();
});


document.addEventListener('DOMContentLoaded', function() {
    // Check for click events on the navbar burger icon

    var options = {
			slidesToScroll: 1,
			slidesToShow: 1,
			loop: true,
			infinite: true,
			autoplay: true,
			autoplaySpeed: 5000,
    }

		// Initialize all div with carousel class
    var carousels = bulmaCarousel.attach('.carousel', options);
	
    bulmaSlider.attach();

})

document.addEventListener('DOMContentLoaded', function() {
    const hero = document.querySelector('.publication-hero');
    const video = hero.querySelector('.hero-background');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let heroVisible = true;

    function updatePlayback() {
        if (!reducedMotion.matches && heroVisible && !document.hidden) {
            video.play().catch(() => {});
        } else {
            video.pause();
        }
    }

    reducedMotion.addEventListener('change', updatePlayback);
    new IntersectionObserver(function(entries) {
        heroVisible = entries[0].intersectionRatio > 0;
        updatePlayback();
    }, { threshold: [0, 0.01] }).observe(hero);
    document.addEventListener('visibilitychange', updatePlayback);
    updatePlayback();
});

document.addEventListener('DOMContentLoaded', function() {
    const highlightVideo = document.querySelector('.highlight-video');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let highlightVisible = false;

    function updateHighlightPlayback() {
        if (highlightVisible && !document.hidden && !reducedMotion.matches) {
            highlightVideo.play().catch(() => {});
        } else {
            highlightVideo.pause();
        }
    }

    new IntersectionObserver(function(entries) {
        highlightVisible = entries[0].isIntersecting;
        updateHighlightPlayback();
    }, { threshold: 0.3 }).observe(highlightVideo);
    document.addEventListener('visibilitychange', updateHighlightPlayback);
    reducedMotion.addEventListener('change', updateHighlightPlayback);

    const navigationLinks = document.querySelectorAll('.nav-links a');
    const sectionObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (!entry.isIntersecting) return;
            navigationLinks.forEach(function(link) {
                if (link.hash === '#' + (entry.target.dataset.navSection || entry.target.id)) {
                    link.setAttribute('aria-current', 'location');
                } else {
                    link.removeAttribute('aria-current');
                }
            });
        });
    }, { rootMargin: '-15% 0px -65% 0px' });
    document.querySelectorAll('section[id]').forEach(function(section) {
        sectionObserver.observe(section);
    });
});
