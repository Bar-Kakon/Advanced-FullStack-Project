import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api } from '../../api/client';
import { AppNav } from '../../components/AppNav';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { localeOf } from '../../i18n/dateFormat';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import profileCss from '../profile/profile.css?inline';
import timelineCss from './timeline.css?inline';

interface TimelineStage {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly isGate: boolean;
  readonly dependsOn: readonly string[];
}

interface TimelineTask {
  readonly id: string;
  readonly title: string;
  readonly startDate: string;
  readonly dueDate: string;
  readonly started: boolean;
  readonly completed: boolean;
  readonly stageId: string | null;
}

interface TimelineData {
  readonly project: { readonly name: string; readonly startDate: string; readonly targetEndDate: string };
  readonly stages: readonly TimelineStage[];
  readonly tasks: readonly TimelineTask[];
}

const DAY = 86_400_000;

/**
 * PRJ-10, read-only by construction: the chronology from the project's own dates, the bars from
 * the tasks' stored dates and progress stamps, and the dependency lines exactly as the GC stored
 * them BETWEEN STAGES — the owner's rule — never inferred from task order. No person is named on
 * any bar, so nothing here widens D7 or D15, and nothing here edits anything.
 */
export const ProjectTimelinePage = () => {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const { projectId } = useParams<{ projectId: string }>();
  const copy = t.timeline;

  useScreenStylesheet({ id: 'profile.css', css: profileCss }, { id: 'timeline.css', css: timelineCss });
  useDocumentTitle(copy.documentTitle);

  const [data, setData] = useState<TimelineData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (projectId === undefined) return;
    let current = true;
    api
      .get<TimelineData>(`/projects/${projectId}/stages/timeline`)
      .then((response) => {
        if (current) setData(response.data);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [projectId]);

  const name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
  const locale = localeOf(lang);
  const dayLabel = (iso: string): string =>
    new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });

  const render = (timeline: TimelineData) => {
    const datedTasks = timeline.tasks.filter((task) => task.startDate && task.dueDate);
    const from = Math.min(
      new Date(timeline.project.startDate).getTime(),
      ...datedTasks.map((task) => new Date(task.startDate).getTime()),
    );
    const to = Math.max(
      new Date(timeline.project.targetEndDate).getTime(),
      ...datedTasks.map((task) => new Date(task.dueDate).getTime()),
    );
    const span = Math.max(to - from, DAY);
    const position = (iso: string): number => ((new Date(iso).getTime() - from) / span) * 100;
    const now = Date.now();
    const todayPct = now >= from && now <= to ? ((now - from) / span) * 100 : null;

    const stageName = (id: string): string =>
      timeline.stages.find((stage) => stage.id === id)?.name ?? '';
    const groups: { readonly stage: TimelineStage | null; readonly tasks: readonly TimelineTask[] }[] = [
      ...timeline.stages.map((stage) => ({
        stage,
        tasks: datedTasks.filter((task) => task.stageId === stage.id),
      })),
      { stage: null, tasks: datedTasks.filter((task) => task.stageId === null) },
    ].filter((group) => group.stage !== null || group.tasks.length > 0);

    const stateOf = (task: TimelineTask): string =>
      task.completed
        ? 'done'
        : new Date(task.dueDate).getTime() < now
          ? 'overdue'
          : task.started
            ? 'active'
            : 'planned';

    return (
      <>
        <div className="tl-range">
          <span>{dayLabel(timeline.project.startDate)}</span>
          <span className="tl-range__title" dir="auto">{timeline.project.name}</span>
          <span>{dayLabel(timeline.project.targetEndDate)}</span>
        </div>

        {datedTasks.length === 0 && timeline.stages.length === 0 ? (
          <p className="msg-empty">{copy.empty}</p>
        ) : (
          <div className="tl-chart">
            {todayPct !== null ? (
              <div className="tl-today" style={{ insetInlineStart: `${todayPct}%` }}>
                <span className="tl-today__label">{copy.today}</span>
              </div>
            ) : null}

            {groups.map((group) => (
              <section key={group.stage?.id ?? 'none'} className="tl-stage">
                <header className="tl-stage__head">
                  <h2 className="tl-stage__name" dir="auto">
                    {group.stage?.name ?? copy.noStage}
                    {group.stage?.isGate ? <span className="tl-tag">{copy.gate}</span> : null}
                  </h2>
                  {group.stage !== null && group.stage.dependsOn.length > 0 ? (
                    <p className="tl-stage__deps" dir="auto">
                      {copy.dependsOn}: {group.stage.dependsOn.map(stageName).join(' · ')}
                    </p>
                  ) : null}
                </header>

                {group.tasks.length === 0 ? (
                  <p className="tl-stage__empty">{copy.stageEmpty}</p>
                ) : (
                  group.tasks.map((task) => (
                    <div key={task.id} className="tl-row">
                      <span className="tl-row__title" dir="auto">{task.title}</span>
                      <div className="tl-row__track">
                        <div
                          className={`tl-bar tl-bar--${stateOf(task)}`}
                          style={{
                            insetInlineStart: `${position(task.startDate)}%`,
                            width: `${Math.max(position(task.dueDate) - position(task.startDate), 1.5)}%`,
                          }}
                          title={`${dayLabel(task.startDate)} – ${dayLabel(task.dueDate)}`}
                        />
                      </div>
                    </div>
                  ))
                )}
              </section>
            ))}

            <div className="tl-legend">
              <span><i className="tl-dot tl-bar--planned" /> {copy.planned}</span>
              <span><i className="tl-dot tl-bar--active" /> {copy.inProgress}</span>
              <span><i className="tl-dot tl-bar--done" /> {copy.completed}</span>
              <span><i className="tl-dot tl-bar--overdue" /> {copy.overdue}</span>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <AppNav name={name} initials={initialsOf(user?.firstName ?? '', user?.lastName ?? '')} />
      <main className="profile-main">
        <header className="profile-header">
          <h1 className="profile-title">{copy.title}</h1>
          <p className="profile-lede">{copy.lede}</p>
          <Link to={`/projects/${projectId}`} className="btn btn--ghost btn--sm">{copy.back}</Link>
        </header>

        {failed ? (
          <p className="msg-empty" role="alert">{copy.failed}</p>
        ) : data === null ? (
          <p className="msg-empty">{copy.loading}</p>
        ) : (
          render(data)
        )}
      </main>
    </>
  );
};
