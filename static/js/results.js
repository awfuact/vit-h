// Values are transcribed from fig_ablation/fig_{model_size,pretrain_data,posttrain_data,cross_tracker}/plot_*.py.
// Figure 4 uses model/pre-training sweeps before post-training; Figure 5 uses held-out trackers.
document.addEventListener('DOMContentLoaded', () => {
    const data = JSON.parse(document.getElementById('results-data').textContent);
    const portrait = matchMedia('(max-width: 1100px) and (orientation: portrait), (max-width: 760px)');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const metricColors = { 0: '#8dbbd5', 3: '#cf9fba' };
    const modelColors = ['#a5adb5', '#8dbbd5', '#cf9fba'];
    // Match Figure 4's per-generator ranges rather than pooling the two generators.
    const scalingAxes = {
        model: { offline: [[40, 100, 20], [50, 90, 10]], online: [[30, 70, 10], [60, 90, 10]] },
        pretrain: { offline: [[46.5, 78, 10], [55.5, 86, 10]], online: [[28.8, 53.5, 10], [66.5, 97, 10]] },
        posttrain: { offline: [[72.5, 82.2, 2], [52.1, 61.4, 2]], online: [[45.5, 67.9, 5], [61, 76.4, 5]] },
    };
    const controllers = [];
    const cards = data.map(item => ({
        ...item, element: document.querySelector(`[data-result-card="${item.id}"]`),
        position: reducedMotion.matches ? item.x.length - 1 : -1, plots: [],
    }));
    const svgNamespace = 'http://www.w3.org/2000/svg';

    function svgElement(tag, attributes, text) {
        const element = document.createElementNS(svgNamespace, tag);
        Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function describePoint(card, generator, index, metric) {
        const row = card.series[generator][index];
        const name = metric === 0 ? 'success rate' : 'tracking MPJPE';
        const interval = row[metric + 1] === null ? '' : `; 95% CI ${row[metric + 1].toFixed(2)}–${row[metric + 2].toFixed(2)}`;
        return `${generator === 'offline' ? 'Offline' : 'Online'} · ${card.labels[index]} · ${name}: ${row[metric].toFixed(2)}${metric === 0 ? '%' : ''}${interval}`;
    }

    function buildPlots(card) {
        card.plots = [...card.element.querySelectorAll('.result-chart')].map(container => {
            const width = container.getBoundingClientRect().width;
            const svg = container.querySelector('svg');
            const metric = Number(container.dataset.metric);
            const generator = container.dataset.generator;
            const plottedSeries = generator ? [[generator, card.series[generator]]] : Object.entries(card.series);
            const isTracker = card.id.startsWith('tracker-');
            const height = isTracker ? 220 : 200;
            const left = 35, right = width - 12, top = 25, bottom = 165;
            const values = plottedSeries.flatMap(([, rows]) => rows.flatMap(row => row.slice(metric, metric + 3).filter(value => value !== null)));
            const minimum = Math.min(...values), maximum = Math.max(...values);
            const span = maximum - minimum;
            const rawStep = span / 3;
            const power = 10 ** Math.floor(Math.log10(rawStep));
            let step = [1, 2, 2.5, 5, 10].find(value => value * power >= rawStep) * power;
            let low = minimum - span * .06, high = maximum + span * .06;
            if (scalingAxes[card.id]) [low, high, step] = scalingAxes[card.id][generator][metric === 0 ? 0 : 1];
            // The paper treats the x-axis settings as equally spaced categories.
            const padding = card.bubbles ? .65 : isTracker ? .4 : .25;
            const x = value => left + (card.x.indexOf(value) + padding) / (card.x.length - 1 + 2 * padding) * (right - left);
            const y = value => bottom - (value - low) / (high - low) * (bottom - top);
            svg.replaceChildren();
            svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
            svg.style.height = `${height}px`;
            svg.append(svgElement('title', {}, `${card.title}: ${metric === 0 ? 'success rate, higher is better' : 'tracking MPJPE, lower is better'}`));
            for (let tick = Math.ceil(low / step) * step; tick <= high; tick += step) {
                svg.append(svgElement('line', { x1: left, x2: right, y1: y(tick), y2: y(tick), class: 'chart-grid' }));
                svg.append(svgElement('text', { x: left - 10, y: y(tick) + 5, 'text-anchor': 'end', class: 'chart-tick' }, Number(tick.toFixed(2))));
            }
            svg.append(svgElement('line', { x1: left, x2: right, y1: bottom, y2: bottom, class: 'chart-axis' }));
            const labels = card.bubbles ? ['small', 'medium', 'large'] : card.labels;
            labels.forEach((label, index) => {
                const tick = svgElement('text', {
                    x: x(card.x[index]), y: bottom + 26, 'text-anchor': 'middle', class: 'chart-tick', 'aria-label': label,
                });
                if (isTracker) {
                    label.split(' ').forEach((word, line) => tick.append(svgElement('tspan', {
                        x: x(card.x[index]), dy: line === 0 ? 0 : 17,
                    }, word)));
                } else tick.textContent = label;
                svg.append(tick);
            });
            const series = plottedSeries.map(([generator, rows]) => {
                const color = metricColors[metric];
                const band = svgElement('path', { class: 'chart-band', fill: color });
                const line = svgElement('path', { class: 'chart-line', stroke: color });
                svg.append(band, line);
                const points = rows.map((row, index) => {
                    const cx = x(card.x[index]), cy = y(row[metric]);
                    const radius = card.bubbles ? 12 * card.x[index] / card.x.at(-1) : 4;
                    const pointColor = card.bubbles ? modelColors[index] : color;
                    const marker = generator === 'offline' || container.dataset.generator
                        ? svgElement('circle', { cx, cy, r: radius, class: 'chart-marker', fill: card.bubbles ? pointColor : '#0b0909', stroke: pointColor })
                        : svgElement('rect', { x: cx - radius, y: cy - radius, width: 2 * radius, height: 2 * radius, rx: 1, class: 'chart-marker', fill: '#0b0909', stroke: color });
                    const description = describePoint(card, generator, index, metric);
                    if (card.bubbles) marker.style.strokeWidth = '0';
                    marker.setAttribute('role', 'img');
                    marker.setAttribute('aria-label', description);
                    svg.append(marker);
                    const label = card.bubbles ? svgElement('text', { x: cx, y: cy - radius - 6, 'text-anchor': 'middle', class: 'chart-parameter' }, card.labels[index]) : null;
                    if (label) svg.append(label);
                    return { marker, label };
                });
                return { rows, band, line, points };
            });
            return { x, y, metric, series };
        });
        drawCard(card);
    }

    function drawCard(card) {
        card.plots.forEach(plot => {
            plot.series.forEach(series => {
                const count = Math.max(0, Math.floor(card.position));
                const fraction = card.position - count;
                const partialPoints = column => {
                    const points = series.rows.slice(0, count + 1).map((row, index) => [plot.x(card.x[index]), plot.y(row[column])]);
                    if (fraction > 0 && count + 1 < series.rows.length) {
                        const a = points.at(-1);
                        const b = [plot.x(card.x[count + 1]), plot.y(series.rows[count + 1][column])];
                        points.push([a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction]);
                    }
                    return points;
                };
                const path = points => points.map((point, index) => `${index ? 'L' : 'M'}${point.join(',')}`).join(' ');
                series.line.setAttribute('d', card.position < 0 || card.bubbles ? '' : path(partialPoints(plot.metric)));
                series.band.setAttribute('d', card.position < 0 || series.rows[0][plot.metric + 1] === null ? '' :
                    `${path(partialPoints(plot.metric + 2))} ${path(partialPoints(plot.metric + 1).reverse()).replace('M', 'L')} Z`);
                series.points.forEach(({ marker, label }, index) => {
                    const shown = index <= card.position || (index === 0 && card.position > -1);
                    marker.style.opacity = shown ? String(index === 0 ? Math.min(1, card.position + 1) : 1) : '0';
                    marker.setAttribute('aria-hidden', String(!shown));
                    if (label) label.style.opacity = marker.style.opacity;
                });
            });
        });
    }

    function active(controller) { return controller.mobile === null || controller.mobile === portrait.matches; }

    function updateControls(controller) {
        const pending = controller.steps.findIndex(step => step.card.position < step.index);
        const current = controller.current ?? (pending === -1 ? controller.steps.length - 1 : Math.max(0, pending - 1));
        controller.buttons.forEach((button, index) => {
            const step = controller.steps[index];
            button.classList.toggle('is-done', step.card.position >= step.index);
            if (index === current) button.setAttribute('aria-current', 'step');
            else button.removeAttribute('aria-current');
        });
        const step = controller.steps[current];
        if (controller.caption) controller.caption.textContent = `${current + 1} / ${controller.steps.length} · ${step.card.title}: ${step.card.labels[step.index]}`;
        controller.scope.dataset.playback = pending === -1 ? 'complete' : controller.frame ? 'playing' : 'waiting';
    }

    function stop(controller) {
        cancelAnimationFrame(controller.frame);
        controller.frame = null;
        controller.previousTime = null;
    }

    function play(controller) {
        if (!active(controller) || !controller.visible || document.hidden || reducedMotion.matches || controller.frame) return;
        if (controller.steps.every(step => step.card.position >= step.index)) {
            updateControls(controller);
            return;
        }
        function tick(time) {
            const delta = controller.previousTime === null ? 0 : Math.min(80, time - controller.previousTime);
            controller.previousTime = time;
            if (controller.replayOnly) {
                // Advance along one continuous timeline, without stopping at sample points.
                const card = controller.cards[0];
                const next = card.position + delta / (card.position < 0 ? 220 : 750);
                card.position = Math.min(card.x.length - 1, card.position < 0 ? Math.min(0, next) : next);
                drawCard(card);
                if (card.position === card.x.length - 1) {
                    stop(controller);
                    updateControls(controller);
                    return;
                }
                controller.frame = requestAnimationFrame(tick);
                updateControls(controller);
                return;
            }
            if (controller.hold > 0) {
                controller.hold -= delta;
            } else {
                if (controller.current === null) {
                    controller.current = controller.steps.findIndex(step => step.card.position < step.index);
                    if (controller.current < 0) {
                        controller.current = null;
                        stop(controller);
                        updateControls(controller);
                        return;
                    }
                    const step = controller.steps[controller.current];
                    controller.from = step.card.position;
                    controller.elapsed = 0;
                    updateControls(controller);
                }
                const step = controller.steps[controller.current];
                controller.elapsed += delta;
                const progress = Math.min(1, controller.elapsed / (step.index === 0 ? 350 : 850));
                step.card.position = controller.from + (step.index - controller.from) * progress;
                drawCard(step.card);
                if (progress === 1) {
                    controller.current = null;
                    controller.hold = 450;
                    updateControls(controller);
                }
            }
            controller.frame = requestAnimationFrame(tick);
        }
        controller.frame = requestAnimationFrame(tick);
        updateControls(controller);
    }

    function seek(controller, index) {
        stop(controller);
        controller.cards.forEach(card => { card.position = -1; });
        controller.steps.slice(0, index + 1).forEach(step => { step.card.position = step.index; });
        controller.cards.forEach(drawCard);
        controller.current = null;
        controller.hold = controller.replayOnly ? 0 : 600;
        updateControls(controller);
        play(controller);
    }

    function createController(scope, groupCards, controls, mobile, replayOnly = false) {
        const steps = groupCards.flatMap(card => card.labels.map((_, index) => ({ card, index })));
        if (replayOnly) {
            const replay = document.createElement('button');
            replay.type = 'button';
            replay.className = 'result-replay';
            replay.textContent = '↻ Replay';
            replay.setAttribute('aria-label', `Replay ${groupCards[0].title}`);
            controls.append(replay);
        } else {
            controls.innerHTML = '<div class="result-controls-line"><span class="result-controls-caption"></span><button class="result-replay" type="button">↻ Replay</button></div><div class="result-progress" role="group" aria-label="Animation steps"></div>';
        }
        const controller = { scope, cards: groupCards, controls, mobile, replayOnly, steps, visible: false, frame: null, previousTime: null, current: null, hold: 0, elapsed: 0 };
        controller.caption = controls.querySelector('.result-controls-caption');
        controller.buttons = replayOnly ? [] : steps.map((step, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('aria-label', `${index + 1}. ${step.card.title}: ${step.card.labels[step.index]}; continue from here`);
            button.title = `${step.card.title}: ${step.card.labels[step.index]}`;
            button.innerHTML = '<span aria-hidden="true"></span>';
            button.addEventListener('click', () => seek(controller, index));
            button.addEventListener('keydown', event => {
                const next = { ArrowLeft: Math.max(0, index - 1), ArrowRight: Math.min(steps.length - 1, index + 1), Home: 0, End: steps.length - 1 }[event.key];
                if (next === undefined) return;
                event.preventDefault();
                controller.buttons[next].focus();
                seek(controller, next);
            });
            controls.querySelector('.result-progress').append(button);
            return button;
        });
        controls.querySelector('.result-replay').addEventListener('click', () => {
            if (reducedMotion.matches) return;
            seek(controller, -1);
        });
        controllers.push(controller);
    }

    document.querySelectorAll('.results-explorer').forEach(explorer => {
        const groupCards = cards.filter(card => explorer.contains(card.element));
        groupCards.forEach(card => createController(card.element, [card], card.element.querySelector('.result-card-heading'), null, true));
    });

    function changeLayout() {
        controllers.forEach(controller => {
            stop(controller);
            controller.current = null;
            controller.controls.hidden = !active(controller);
            updateControls(controller);
        });
        cards.forEach(buildPlots);
        controllers.forEach(play);
    }

    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        const controller = controllers.find(item => item.scope === entry.target);
        controller.visible = entry.isIntersecting;
        if (!controller.visible) stop(controller);
        else play(controller);
    }), { rootMargin: '-110px 0px -30px 0px', threshold: 0 });
    const resizeObserver = new ResizeObserver(entries => entries.forEach(entry => {
        buildPlots(cards.find(card => card.element === entry.target));
    }));
    changeLayout();
    cards.forEach(card => resizeObserver.observe(card.element));
    controllers.forEach(controller => observer.observe(controller.scope));
    portrait.addEventListener('change', changeLayout);
    reducedMotion.addEventListener('change', () => {
        if (reducedMotion.matches) cards.forEach(card => { card.position = card.x.length - 1; });
        changeLayout();
    });
    document.addEventListener('visibilitychange', () => controllers.forEach(controller => {
        if (document.hidden) stop(controller);
        else play(controller);
    }));
});
