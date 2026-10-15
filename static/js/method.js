document.addEventListener('DOMContentLoaded', () => {
    const explorer = document.querySelector('.method-explorer');
    if (!explorer) return;

    const portrait = window.matchMedia('(max-width: 1100px) and (orientation: portrait)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const parts = [...explorer.querySelectorAll('[data-stage]')];
    const allSteps = [...explorer.querySelectorAll('[data-step]')];
    const controllers = [];
    const deploymentStage = explorer.querySelector('.method-stage-deploy');
    const deploymentPaths = [...deploymentStage.querySelectorAll('.method-connector > path')];
    const desktopDeploymentPaths = deploymentPaths.map(path => path.getAttribute('d'));

    function alignDeploymentArrows() {
        if (!portrait.matches) {
            deploymentPaths.forEach((path, index) => path.setAttribute('d', desktopDeploymentPaths[index]));
            return;
        }
        const gap = deploymentStage.getBoundingClientRect().width * 0.0045;
        const bounds = name => deploymentStage.querySelector(`[data-shape="${name}"]`).getBoundingClientRect();
        function connect(name, points, direction) {
            const svg = deploymentStage.querySelector(`svg[data-shape="${name}"]`);
            const path = svg.querySelector(':scope > path');
            const inverse = svg.getScreenCTM().inverse();
            const coordinates = points.map(([x, y]) => new DOMPoint(x, y).matrixTransform(inverse));
            const marker = svg.querySelector('marker');
            // The visible arrow tip extends past the path endpoint; leave the gap at the tip.
            const overhang = (marker.viewBox.baseVal.width - marker.refX.baseVal.value)
                * marker.markerWidth.baseVal.value / marker.viewBox.baseVal.width
                * parseFloat(getComputedStyle(path).strokeWidth);
            const last = coordinates[coordinates.length - 1];
            if (direction === 'right') last.x -= overhang;
            else if (direction === 'left') last.x += overhang;
            else last.y += overhang;
            path.setAttribute('d', coordinates.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`).join(' '));
        }
        ['OFFLINE', 'ONLINE MOTION', 'ONLINE OBJECT'].forEach((row, index) => {
            const input = bounds(`${row} / input / REAL SOURCE / ${row === 'ONLINE OBJECT' ? 'v15' : 'v16'}`);
            const generator = bounds(`${row} / generator`);
            const tracker = bounds(`${row} / motion tracker`);
            const robot = bounds(`${row} / robot / REAL SOURCE / ${row === 'ONLINE OBJECT' ? 'v15' : 'v16'}`);
            const y = (generator.top + generator.bottom) / 2;
            connect(`${row} / input flow / 1`, [[input.right + gap, y], [generator.left - gap, y]], 'right');
            connect(`${row} / reference flow / 1`, [[generator.right + gap, y], [tracker.left - gap, y]], 'right');
            connect(`${row} / action flow / 1`, [[tracker.right + gap, y], [robot.left - gap, y]], 'right');
            if (index === 0) return;
            const prefix = deploymentStage.querySelectorAll('.method-shape[data-shape="ONLINE MOTION / prefix box"]')[index - 1].getBoundingClientRect();
            const robotX = (robot.left + robot.right) / 2;
            const prefixY = (prefix.top + prefix.bottom) / 2;
            connect(`Elbow Connector ${index === 1 ? 272 : 277}`, [[robotX, robot.bottom + gap], [robotX, prefixY], [prefix.right + gap, prefixY]], 'left');
            const generatorX = (generator.left + generator.right) / 2;
            connect(`${row} / prefix conditioning / 1`, [[generatorX, prefix.top - gap], [generatorX, generator.bottom + gap]], 'up');
        });
    }
    new ResizeObserver(alignDeploymentArrows).observe(deploymentStage);

    function createController(scope, steps, controls, mobile) {
        const controller = {
            scope, steps, controls, mobile, cursor: -1, mode: 'waiting', visible: false,
            running: false, generation: 0, timer: null, animations: [],
            buttons: [...controls.querySelectorAll('[data-seek]')],
            caption: controls.querySelector('.method-control-caption'),
        };
        controls.querySelector('.method-replay').addEventListener('click', () => replay(controller));
        controller.buttons.forEach((button, index) => {
            button.addEventListener('click', () => seek(controller, index));
            button.addEventListener('keydown', event => {
                let next;
                if (event.key === 'ArrowRight') next = Math.min(index + 1, steps.length - 1);
                else if (event.key === 'ArrowLeft') next = Math.max(index - 1, 0);
                else if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = steps.length - 1;
                else return;
                event.preventDefault();
                controller.buttons[next].focus();
                seek(controller, next);
            });
        });
        controllers.push(controller);
        return controller;
    }

    function updateControls() {
        controllers.forEach(controller => {
            controller.buttons.forEach((button, index) => {
                button.classList.toggle('is-done', controller.steps[index].classList.contains('is-revealed'));
                if (index === controller.cursor) button.setAttribute('aria-current', 'step');
                else button.removeAttribute('aria-current');
            });
            controller.scope.dataset.playback = controller.mode;
            if (!controller.mobile) {
                controller.caption.textContent = controller.cursor < 0
                    ? 'Follow the video-to-humanoid pipeline'
                    : `${controller.cursor + 1} / ${controller.steps.length} · ${controller.steps[controller.cursor].dataset.narration}`;
            }
        });
    }

    function setShown(step, shown) {
        step.classList.toggle('is-revealed', shown);
        if (shown) step.removeAttribute('aria-hidden');
        else step.setAttribute('aria-hidden', 'true');
    }

    function stop(controller) {
        controller.generation += 1;
        window.clearTimeout(controller.timer);
        controller.timer = null;
        controller.animations.forEach(animation => animation.cancel());
        controller.animations = [];
        controller.running = false;
    }

    function animate(controller, target, frames, options) {
        const animation = target.animate(frames, { fill: 'both', easing: 'ease-out', ...options });
        controller.animations.push(animation);
    }

    function revealElement(controller, element, delay) {
        // Update the mask on the main thread instead of retaining a composited clip animation.
        // A completed or interrupted reveal always returns to an explicitly unclipped state.
        let elapsed = 0;
        let previousTime = null;
        let frame = null;
        let resolveFinished;
        const animation = {
            finished: new Promise(resolve => { resolveFinished = resolve; }),
            playState: 'paused',
            play() {
                if (animation.playState !== 'paused') return;
                animation.playState = 'running';
                previousTime = null;
                frame = requestAnimationFrame(draw);
            },
            pause() {
                if (animation.playState !== 'running') return;
                cancelAnimationFrame(frame);
                animation.playState = 'paused';
                previousTime = null;
            },
            cancel() {
                cancelAnimationFrame(frame);
                element.style.clipPath = 'none';
                element.style.opacity = '1';
                animation.playState = 'finished';
                resolveFinished();
            },
        };

        function setProgress(progress) {
            const hidden = 100 * Math.pow(1 - progress, 3);
            const masks = {
                right: `inset(0 ${hidden}% 0 0)`, left: `inset(0 0 0 ${hidden}%)`,
                down: `inset(0 0 ${hidden}% 0)`, up: `inset(${hidden}% 0 0 0)`,
            };
            element.style.clipPath = masks[element.dataset.direction];
            element.style.opacity = String(1 - 0.65 * hidden / 100);
        }

        function draw(time) {
            if (previousTime !== null) elapsed += time - previousTime;
            previousTime = time;
            const progress = Math.min(1, Math.max(0, (elapsed - delay) / 600));
            if (progress === 1) {
                animation.cancel();
                return;
            }
            setProgress(progress);
            frame = requestAnimationFrame(draw);
        }

        setProgress(0);
        controller.animations.push(animation);
        animation.play();
    }

    function animateStep(controller, step) {
        step.querySelectorAll('[data-reveal]').forEach(element => {
            const delay = Number(element.dataset.delay);
            if (element.matches('svg')) {
                element.querySelectorAll(':scope > path').forEach(path => {
                    if (path.getAttribute('fill') === 'none') {
                        const length = path.getTotalLength();
                        const reverse = path.hasAttribute('marker-start') && !path.hasAttribute('marker-end');
                        animate(controller, path, [
                            { strokeDasharray: `${length} ${length}`, strokeDashoffset: reverse ? -length : length },
                            { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 },
                        ], { duration: 550, delay, easing: 'linear' });
                    } else {
                        const direction = element.dataset.direction;
                        const horizontal = direction === 'right' || direction === 'left';
                        path.style.transformBox = 'fill-box';
                        path.style.transformOrigin = horizontal ? 'left center' : direction === 'down' ? 'center top' : 'center bottom';
                        animate(controller, path, [
                            { transform: horizontal ? 'scaleX(0)' : 'scaleY(0)' },
                            { transform: horizontal ? 'scaleX(1)' : 'scaleY(1)' },
                        ], { duration: 650, delay });
                    }
                });
                element.querySelectorAll('marker path').forEach(head => {
                    animate(controller, head, [{ opacity: 0 }, { opacity: 1 }], { duration: 100, delay: delay + 450 });
                });
            } else {
                revealElement(controller, element, delay);
            }
            if (element.hasAttribute('data-likelihood-arrow')) {
                animate(controller, element, [{ opacity: 0.45, filter: 'brightness(1)' }, { opacity: 1, filter: 'brightness(1.9)' }, { opacity: 1, filter: 'brightness(1)' }],
                    { duration: 550, iterations: 2, delay: delay + 550 });
            }
        });
    }

    function isActive(controller) {
        return controller.mobile === portrait.matches;
    }

    async function advance(controller) {
        if (!isActive(controller) || controller.running || !controller.visible || document.hidden ||
            controller.mode === 'paused' || controller.mode === 'complete' || reducedMotion.matches) return;
        const next = controller.steps.findIndex((step, index) => index > controller.cursor && !step.classList.contains('is-revealed'));
        if (next < 0) {
            controller.mode = 'complete';
            updateControls();
            return;
        }
        controller.running = true;
        controller.mode = 'playing';
        const generation = ++controller.generation;
        const step = controller.steps[next];
        // Decode only the next state's pictures, so the reveal includes the actual content.
        await Promise.allSettled([...step.querySelectorAll('img')].map(img => {
            img.loading = 'eager';
            return img.decode();
        }));
        if (generation !== controller.generation) return;
        controller.cursor = next;
        setShown(step, true);
        updateControls();
        animateStep(controller, step);
        if (!controller.visible || document.hidden) controller.animations.forEach(animation => animation.pause());
        await Promise.allSettled(controller.animations.map(animation => animation.finished));
        if (generation !== controller.generation) return;
        controller.animations.forEach(animation => animation.cancel());
        controller.animations = [];
        controller.timer = window.setTimeout(() => {
            controller.running = false;
            controller.timer = null;
            if (controller.steps.every(item => item.classList.contains('is-revealed'))) controller.mode = 'complete';
            updateControls();
            advance(controller);
        }, 400);
    }

    function seek(controller, index) {
        stop(controller);
        controller.steps.forEach((step, position) => setShown(step, position <= index));
        controller.cursor = index;
        controller.mode = index === controller.steps.length - 1 ? 'complete' : 'playing';
        updateControls();
        if (controller.mode === 'playing' && !reducedMotion.matches) {
            // Keep the selected state readable briefly, then continue the remaining sequence.
            controller.running = true;
            controller.timer = window.setTimeout(() => {
                controller.timer = null;
                controller.running = false;
                advance(controller);
            }, 600);
        }
    }

    function replay(controller) {
        stop(controller);
        controller.cursor = -1;
        controller.mode = 'waiting';
        controller.steps.forEach(step => setShown(step, false));
        if (reducedMotion.matches) {
            controller.steps.forEach(step => setShown(step, true));
            controller.cursor = controller.steps.length - 1;
            controller.mode = 'complete';
        }
        updateControls();
        advance(controller);
    }

    createController(explorer.querySelector('.method-board'), allSteps, explorer.querySelector('.method-global-controls'), false);
    parts.forEach(part => createController(part, [...part.querySelectorAll('[data-step]')], part.querySelector('.method-local-controls'), true));
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            const controller = controllers.find(item => item.scope === entry.target);
            controller.visible = entry.isIntersecting;
            if (!isActive(controller)) return;
            controller.animations.forEach(animation => {
                if (!controller.visible || document.hidden) {
                    if (animation.playState === 'running') animation.pause();
                } else if (animation.playState === 'paused') animation.play();
            });
            advance(controller);
        });
    }, { rootMargin: '-100px 0px -40px 0px', threshold: 0 });

    function changeLayout() {
        alignDeploymentArrows();
        controllers.forEach(controller => {
            stop(controller);
            controller.controls.hidden = !isActive(controller);
            const firstPending = controller.steps.findIndex(step => !step.classList.contains('is-revealed'));
            controller.cursor = firstPending < 0 ? controller.steps.length - 1 : firstPending - 1;
            if (controller.steps.every(step => step.classList.contains('is-revealed'))) controller.mode = 'complete';
            else if (controller.mode !== 'paused') controller.mode = 'waiting';
        });
        updateControls();
        controllers.forEach(advance);
    }

    explorer.classList.add('is-enhanced');
    allSteps.forEach(step => setShown(step, reducedMotion.matches));
    changeLayout();
    controllers.forEach(controller => observer.observe(controller.scope));
    portrait.addEventListener('change', changeLayout);
    reducedMotion.addEventListener('change', () => {
        if (reducedMotion.matches) {
            controllers.forEach(stop);
            allSteps.forEach(step => setShown(step, true));
            controllers.forEach(controller => { controller.cursor = controller.steps.length - 1; controller.mode = 'complete'; });
            updateControls();
        }
    });
    document.addEventListener('visibilitychange', () => {
        controllers.filter(isActive).forEach(controller => {
            controller.animations.forEach(animation => {
                if (document.hidden) {
                    if (animation.playState === 'running') animation.pause();
                } else if (controller.visible && animation.playState === 'paused') animation.play();
            });
            advance(controller);
        });
    });
});
