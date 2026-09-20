import { state } from '../state.js';
import { saveWhatIfScores } from '../storage/caches.js';
import { getCourseColors } from '../utils/colors.js';
import { computeCourseProjection } from '../utils/grade-projections.js';
import { computeCoursePercentagesWithWhatIf, formatScoreNum, gradeTierClass, percentageToGpa } from '../utils/grades.js';
import { escapeHTML } from '../utils/text.js';
import { renderFilterPills } from '../views/upcoming-view.js';

export function updateGradeChangeBadge() {
    const badge = document.getElementById('grades-change-badge');
    if (!badge) return;
    const count = (state.gradeChangeAlerts || []).length;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
    badge.innerText = count;
  }

export function renderGradesView(listContainer, hiddenCourses) {
    listContainer.innerHTML = '';

    const coursePcts = computeCoursePercentagesWithWhatIf(hiddenCourses);
    const gpaPoints = [];
    const courseCardsData = [];

    Object.entries(coursePcts).forEach(([cKey, pct]) => {
      if (pct !== null && !isNaN(pct)) {
        const info = percentageToGpa(pct);
        gpaPoints.push(info.gpa);
        courseCardsData.push({ courseKey: cKey, pct: pct, letter: info.letter, hasGrade: true });
      } else {
        courseCardsData.push({ courseKey: cKey, pct: null, letter: '—', hasGrade: false });
      }
    });

    // Best-first ordering: graded courses ranked by score, ungraded ones
    // (nothing posted yet) pushed to the end instead of sitting wherever
    // Object.entries happened to iterate.
    courseCardsData.sort((a, b) => {
      if (a.hasGrade && b.hasGrade) return b.pct - a.pct;
      if (a.hasGrade) return -1;
      if (b.hasGrade) return 1;
      return a.courseKey.localeCompare(b.courseKey);
    });

    const averageGpa = gpaPoints.length > 0
    ? (gpaPoints.reduce((a, b) => a + b, 0) / gpaPoints.length).toFixed(2)
    : '—';
    const avgGpaTier = gpaPoints.length > 0 ? gradeTierClass((parseFloat(averageGpa) / 4) * 100) : 'tier-none';

    // GPA Header
    const gpaCard = document.createElement('div');
    gpaCard.className = `gpa-card ${avgGpaTier}`;
    const hasWhatIfActive = Object.keys(state.whatIfScores).length > 0;
    const courseCountLabel = gpaPoints.length > 0
    ? `Based on ${gpaPoints.length} graded course${gpaPoints.length === 1 ? '' : 's'}`
    : 'No grades posted yet';
    const gpaRingPct = gpaPoints.length > 0 ? Math.max(0, Math.min(100, (parseFloat(averageGpa) / 4) * 100)) : 0;
    gpaCard.innerHTML = `
    <div class="gpa-info-left">
    <span class="gpa-label">Current GPA${hasWhatIfActive ? ' <span class="gpa-whatif-flag">What-If</span>' : ''}</span>
    <span class="gpa-sub">${courseCountLabel}</span>
    </div>
    <div class="gpa-ring-wrap">
    <div class="gpa-ring" style="--gpa-pct:${gpaRingPct}"></div>
    <div class="gpa-ring-value">${averageGpa}</div>
    </div>
    `;
    listContainer.appendChild(gpaCard);

    // Grade-change alerts: new/changed scores since the last scan. Dismissible.
    if ((state.gradeChangeAlerts || []).length > 0) {
      const changeCard = document.createElement('div');
      changeCard.className = 'grade-changes-card';
      changeCard.innerHTML = `
      <div class="grade-changes-header">
      <span class="grade-changes-title">🔔 Grade updates</span>
      <button type="button" class="grade-changes-dismiss" id="grade-changes-dismiss" title="Dismiss">Dismiss</button>
      </div>
      ${state.gradeChangeAlerts.map(a => `
        <div class="grade-change-row">
        <span class="grade-change-course" title="${escapeHTML(a.courseName || a.courseKey)}">${escapeHTML(a.courseKey)}</span>
        <span class="grade-change-title">${escapeHTML(a.title)}</span>
        <span class="grade-change-delta">${a.isNew
          ? `posted ${formatScoreNum(a.score)}${a.pct !== null ? ` · ${a.pct.toFixed(0)}%` : ''}`
          : `${formatScoreNum(a.oldScore)} → ${formatScoreNum(a.score)}${a.pct !== null ? ` (${(a.oldPct || 0).toFixed(0)}% → ${a.pct.toFixed(0)}%)` : ''}`}</span>
        </div>`).join('')}
      `;
      const dismissBtn = changeCard.querySelector('#grade-changes-dismiss');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
          state.gradeChangeAlerts = [];
          updateGradeChangeBadge();
          renderGradesView(listContainer, hiddenCourses);
        });
      }
      listContainer.appendChild(changeCard);
    }

    // Course Summary Cards — clickable to filter the feedback list & the
    // what-if matrix down to just that course (mirrors the course pills).
    if (courseCardsData.length > 0) {
      const grid = document.createElement('div');
      grid.className = 'course-grades-grid';
      courseCardsData.forEach(item => {
        const tier = gradeTierClass(item.pct);
        const isActiveFilter = state.activeCourseFilter === item.courseKey;
        const cCard = document.createElement('div');
        cCard.className = `course-grade-summary-card ${tier} ${isActiveFilter ? 'is-filtering' : ''}`;
        cCard.title = isActiveFilter ? 'Click to clear filter' : `Click to filter by ${item.courseKey}`;

        const coursePalette = getCourseColors(item.courseKey);
        cCard.style.setProperty('--course-accent', coursePalette.accent);
        cCard.style.setProperty('--course-glow', coursePalette.glow);
        cCard.style.setProperty('--course-soft', coursePalette.soft);
        if (item.hasGrade) {
          const barPct = Math.max(0, Math.min(100, item.pct));
          const proj = computeCourseProjection(item.courseKey);
          const needLine = proj && proj.needed.length > 0
          ? `Need ${proj.needed[0].pct}% on remaining for ${proj.needed[0].letter}`
          : '';
          cCard.innerHTML = `
          <div class="cg-top-row">
          <span class="cg-name">${escapeHTML(item.courseKey)}</span>
          <div class="cg-score-wrap">
          <span class="cg-percent">${item.pct.toFixed(1)}%</span>
          <span class="cg-letter">${item.letter}</span>
          </div>
          </div>
          <div class="cg-bar-bg"><div class="cg-bar-fill" style="width:${barPct}%"></div></div>
          ${needLine ? `<div class="cg-need-line" title="Score ~${needLine.replace('Need ', '')} on everything still ungraded">${needLine}</div>` : ''}
          `;
        } else {
          cCard.innerHTML = `
          <div class="cg-top-row">
          <span class="cg-name">${escapeHTML(item.courseKey)}</span>
          <div class="cg-score-wrap">
          <span class="cg-percent no-grade">No grades yet</span>
          </div>
          </div>
          <div class="cg-bar-bg"><div class="cg-bar-fill" style="width:0%"></div></div>
          `;
        }

        cCard.addEventListener('click', () => {
          state.activeCourseFilter = isActiveFilter ? 'ALL' : item.courseKey;
          renderFilterPills();
          renderGradesView(listContainer, hiddenCourses);
        });

        grid.appendChild(cCard);
      });
      listContainer.appendChild(grid);
    }

    // What-If Matrix
    const tasksByCourse = {};
    Object.entries(state.cachedCourseMap).forEach(([cKey, c]) => {
      if (hiddenCourses.includes(cKey)) return;
      if (state.activeCourseFilter !== 'ALL' && state.activeCourseFilter !== cKey) return;

      const validTasks = (c.tasks || []).filter(t => t.points && t.points > 0);
      if (validTasks.length > 0) {
        tasksByCourse[cKey] = validTasks;
      }
    });

    if (Object.keys(tasksByCourse).length > 0) {
      const matrixCard = document.createElement('div');
      matrixCard.className = 'whatif-matrix-card';

      const topBar = document.createElement('div');
      topBar.className = 'whatif-top-bar';
      topBar.innerHTML = `
      <span class="whatif-heading">⚡ What-If Grade Simulator</span>
      ${hasWhatIfActive ? '<button type="button" class="whatif-clear-all-btn" id="whatif-clear-all-btn">Clear Simulations</button>' : ''}
      `;
      matrixCard.appendChild(topBar);

      Object.entries(tasksByCourse).forEach(([cKey, taskList]) => {
        const groupEl = document.createElement('div');
        groupEl.className = 'whatif-course-group';

        const curPct = coursePcts[cKey];
        const projection = computeCourseProjection(cKey);
        const weightedHint = projection && projection.weighted && projection.weightedPct != null ? ' · syllabus-weighted' : '';
        const pctLabel = curPct !== null ? `${curPct.toFixed(1)}% (${percentageToGpa(curPct).letter})${weightedHint}` : 'No grades yet';

        const cHeader = document.createElement('div');
        cHeader.className = 'whatif-course-header';
        cHeader.innerHTML = `
        <span class="whatif-course-tag">${escapeHTML(cKey)}</span>
        <span class="whatif-projected-badge">Projected: ${pctLabel}</span>
        `;
        groupEl.appendChild(cHeader);

        // Syllabus grade weights + "need on remaining" projection for this
        // course. Weights come from parseGradeWeights() in task-loader; the
        // need list is computed by grade-projections.js.
        if (projection) {
          let blockHtml = '';
          if (Array.isArray(projection.weights) && projection.weights.length > 0) {
            blockHtml += `<div class="gci-weights-row">${projection.weights.map(w => `<span class="gci-weight-chip" title="Syllabus weight">${escapeHTML(w.label)} ${w.pct}%</span>`).join('')}</div>`;
          }
          if (projection.needed.length > 0) {
            blockHtml += `<div class="whatif-need-line">Need on remaining: ${projection.needed.map(n => `<span class="whatif-need-chip" title="~${n.pct}% on remaining work for a ${n.letter}">${n.letter} ${n.pct}%</span>`).join('')}</div>`;
          } else if (projection.graded && projection.hasRemaining) {
            blockHtml += `<div class="whatif-need-line">🚀 Remaining work already secured for every tier.</div>`;
          } else if (!projection.graded) {
            blockHtml += `<div class="whatif-need-line">No graded work yet — nothing to project.</div>`;
          }
          if (blockHtml) {
            const projEl = document.createElement('div');
            projEl.className = 'whatif-projection-block';
            projEl.innerHTML = blockHtml;
            groupEl.appendChild(projEl);
          }
        }

        const listEl = document.createElement('div');
        listEl.className = 'whatif-items-list';

        taskList.forEach(task => {
          const sim = state.whatIfScores[task.id];
          const hasSim = !!sim;

          const row = document.createElement('div');
          row.className = `whatif-row-card ${hasSim ? 'has-sim' : ''}`;
          row.innerHTML = `
          <div class="whatif-item-left">
          <span class="whatif-item-title" title="${escapeHTML(task.title)}">${escapeHTML(task.title)}</span>
          <span class="whatif-item-pts">${task.points} pts possible</span>
          </div>
          <div class="whatif-item-right">
          <input type="number" step="0.5" class="whatif-matrix-input" data-task-id="${escapeHTML(task.id)}" placeholder="—" value="${hasSim ? sim.score : ''}" />
          ${hasSim ? `<button type="button" class="whatif-row-reset" data-reset-id="${escapeHTML(task.id)}" title="Remove simulation">×</button>` : ''}
          </div>
          `;

          const inputEl = row.querySelector('.whatif-matrix-input');
          inputEl.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) {
              state.whatIfScores[task.id] = {
                score: val,
                pointsPossible: task.points,
                courseKey: cKey
              };
            } else {
              delete state.whatIfScores[task.id];
            }
            saveWhatIfScores();
            renderGradesView(listContainer, hiddenCourses);
            // Re-rendering recreates every input, which would drop focus after
            // the first keystroke — put the caret back so multi-digit scores
            // can actually be typed.
            const refocused = Array.from(listContainer.querySelectorAll('.whatif-matrix-input'))
              .find(el => el.dataset.taskId === task.id);
            if (refocused) {
              refocused.focus();
              const caret = refocused.value.length;
              refocused.setSelectionRange(caret, caret);
            }
          });

          const rowResetBtn = row.querySelector('.whatif-row-reset');
          if (rowResetBtn) {
            rowResetBtn.addEventListener('click', () => {
              delete state.whatIfScores[task.id];
              saveWhatIfScores();
              renderGradesView(listContainer, hiddenCourses);
            });
          }

          listEl.appendChild(row);
        });

        groupEl.appendChild(listEl);
        matrixCard.appendChild(groupEl);
      });

      const clearAllBtn = matrixCard.querySelector('#whatif-clear-all-btn');
      if (clearAllBtn) {
        clearAllBtn.addEventListener('click', () => {
          state.whatIfScores = {};
          saveWhatIfScores();
          renderGradesView(listContainer, hiddenCourses);
        });
      }

      listContainer.appendChild(matrixCard);
    }

    // The per-submission "Recent Feedback" list now lives only in the
    // bottom-left Recent Grades dashboard panel, so this right-hand Grades
    // panel keeps just the GPA ring, course summaries and the What-If matrix.
  }

export function createGradeCard(grade) {
    const card = document.createElement('div');

    const hasPoints = grade.pointsPossible !== null && grade.pointsPossible !== undefined && !isNaN(grade.pointsPossible);
    const pct = hasPoints && grade.pointsPossible > 0 ? (grade.score / grade.pointsPossible) * 100 : null;
    const tier = gradeTierClass(pct);
    card.className = `grade-card ${tier}`;

    const coursePalette = getCourseColors(grade.courseKey);
    card.style.setProperty('--course-accent', coursePalette.accent);
    card.style.setProperty('--course-glow', coursePalette.glow);
    card.style.setProperty('--course-soft', coursePalette.soft);
    const scoreLabel = hasPoints
    ? `${formatScoreNum(grade.score)} out of ${formatScoreNum(grade.pointsPossible)}`
    : `${formatScoreNum(grade.score)} pts`;

    const gradedLabel = grade.gradedAt
    ? grade.gradedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '';

    const titleEl = document.createElement(grade.url ? 'a' : 'div');
    titleEl.className = 'grade-title';
    titleEl.innerText = grade.title;
    if (grade.url) {
      titleEl.href = grade.url;
      titleEl.target = '_blank';
      titleEl.rel = 'noopener noreferrer';
    }

    const courseSpan = document.createElement('span');
    courseSpan.className = 'grade-course';
    courseSpan.innerText = grade.courseName;

    const meta = document.createElement('div');
    meta.className = 'grade-meta';
    meta.appendChild(courseSpan);

    if (grade.isGradescope) {
      const gsTag = document.createElement('span');
      gsTag.className = 'badge-tag gs-source';
      gsTag.innerText = 'Gradescope';
      meta.appendChild(gsTag);
    }

    if (gradedLabel) {
      const dateSpan = document.createElement('span');
      dateSpan.className = 'grade-date';
      dateSpan.innerText = gradedLabel;
      meta.appendChild(dateSpan);
    }

    const scoreDiv = document.createElement('div');
    scoreDiv.className = 'grade-score';
    scoreDiv.innerText = scoreLabel;
    if (pct !== null) {
      const pctChip = document.createElement('span');
      pctChip.className = 'grade-score-pct';
      pctChip.innerText = `${pct.toFixed(1)}%`;
      scoreDiv.appendChild(pctChip);
    }

    const check = document.createElement('span');
    check.className = 'grade-check';
    check.innerText = pct !== null ? percentageToGpa(pct).letter : '✓';

    const body = document.createElement('div');
    body.className = 'grade-body';
    body.appendChild(titleEl);
    body.appendChild(meta);
    body.appendChild(scoreDiv);

    card.appendChild(check);
    card.appendChild(body);

    return card;
  }
