import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { FormAlert } from '../../components/FormAlert';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import {
  createProjectStage,
  fetchProjectStages,
  setStageDependencies,
  updateProjectStage,
} from '../../api/coordination.api';
import { fetchProjectDashboard } from '../../api/projectDashboard.api';
import type { ProjectStage } from '../../api/coordination.types';
import profileCss from '../profile/profile.css?inline';
import projectsCss from '../projects/projects.css?inline';
import coordinationCss from './coordination.css?inline';

export const StageGraphPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { projectId = '' } = useParams<{ projectId: string }>();

  const [stages, setStages] = useState<readonly ProjectStage[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newIsGate, setNewIsGate] = useState(false);

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'projects.css', css: projectsCss },
    { id: 'coordination.css', css: coordinationCss },
  );
  useDocumentTitle('שלבי הפרויקט / Project stages — FieldSync');

  const copy = t.coordination.stages;

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [rows, dashboard] = await Promise.all([
        fetchProjectStages(projectId),
        fetchProjectDashboard(projectId),
      ]);
      setStages(rows);
      setCanManage(dashboard.viewer.canManageStages);
      setError(null);
    } catch {
      setError(copy.failed);
    } finally {
      setLoading(false);
    }
  }, [projectId, copy.failed]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (work: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
      await load();
    } catch (failure) {
      const code = (failure as { response?: { data?: { code?: string } } }).response?.data?.code;
      setError(code === 'STAGE_DEPENDENCY_CYCLE' ? copy.cycle : copy.failed);
    } finally {
      setBusy(false);
    }
  };

  const addStage = (): void => {
    if (newName.trim() === '') return;
    void run(async () => {
      await createProjectStage(projectId, { name: newName.trim(), isGate: newIsGate });
      setNewName('');
      setNewIsGate(false);
    });
  };

  const move = (stage: ProjectStage, direction: -1 | 1): void => {
    const ordered = [...stages].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((row) => row._id === stage._id);
    const swap = ordered[index + direction];
    if (swap === undefined) return;

    void run(async () => {
      await updateProjectStage(projectId, stage._id, { order: swap.order });
      await updateProjectStage(projectId, swap._id, { order: stage.order });
    });
  };

  const nameOf = (id: string): string => stages.find((row) => row._id === id)?.name ?? '';
  const ordered = [...stages].sort((a, b) => a.order - b.order);

  return (
    <div className="app">
      <AppNav
        name={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()}
        initials={initialsOf(user?.firstName ?? '', user?.lastName ?? '')}
      />

      <main className="profile">
        <header className="profile__head">
          <div className="profile__head-text">
            <h1 className="profile__title">{copy.title}</h1>
            <p className="profile__sub">{copy.lede}</p>
          </div>
          <div className="profile__head-actions">
            <Link to={`/projects/${projectId}`} className="btn btn--ghost btn--sm">{copy.back}</Link>
          </div>
        </header>

        {error === null ? null : (
          <section className="panel"><FormAlert message={error} /></section>
        )}

        {loading ? <p className="panel__lede">{t.coordination.loading}</p> : null}

        {!loading && !canManage ? (
          <section className="panel"><p className="panel__lede">{copy.readOnly}</p></section>
        ) : null}

        <section className="panel" aria-labelledby="stage-list-title">
          <h2 id="stage-list-title" className="panel__title">{copy.title}</h2>
          <p className="panel__lede">{copy.orderNote}</p>

          {ordered.length === 0 && !loading ? (
            <p className="panel__lede">{copy.none}</p>
          ) : (
            <ul className="stage-list">
              {ordered.map((stage, index) => (
                <li key={stage._id} className="stage-item">
                  <div className="stage-item__head">
                    <h3 className="stage-item__name" dir="auto">{stage.name}</h3>
                    <span className={`prop-chip prop-chip--${stage.isGate ? 'gate' : 'plain'}`}>
                      {stage.isGate ? copy.gate : copy.notGate}
                    </span>
                  </div>

                  <p className="stage-item__deps" dir="auto">
                    {stage.dependsOn.length === 0
                      ? copy.dependsOnNone
                      : `${copy.dependsOn}: ${stage.dependsOn.map(nameOf).join(' · ')}`}
                  </p>

                  {canManage ? (
                    <div className="stage-item__actions">
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={busy || index === 0}
                        onClick={() => move(stage, -1)}
                      >
                        {copy.moveUp}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={busy || index === ordered.length - 1}
                        onClick={() => move(stage, 1)}
                      >
                        {copy.moveDown}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            updateProjectStage(projectId, stage._id, { isGate: !stage.isGate }).then(() => undefined),
                          )
                        }
                      >
                        {stage.isGate ? copy.notGate : copy.gate}
                      </button>

                      <label className="field stage-item__dep-picker">
                        <span className="field-label" id={`dep-${stage._id}`}>{copy.addDependency}</span>
                        <select
                          className="input"
                          aria-labelledby={`dep-${stage._id}`}
                          value=""
                          disabled={busy}
                          onChange={(event) => {
                            const chosen = event.target.value;
                            if (chosen === '') return;
                            void run(() =>
                              setStageDependencies(projectId, stage._id, [
                                ...stage.dependsOn,
                                chosen,
                              ]).then(() => undefined),
                            );
                          }}
                        >
                          <option value="">—</option>
                          {ordered
                            .filter((row) => row._id !== stage._id && !stage.dependsOn.includes(row._id))
                            .map((row) => (
                              <option key={row._id} value={row._id}>{row.name}</option>
                            ))}
                        </select>
                      </label>

                      {stage.dependsOn.map((id) => (
                        <button
                          key={id}
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              setStageDependencies(
                                projectId,
                                stage._id,
                                stage.dependsOn.filter((row) => row !== id),
                              ).then(() => undefined),
                            )
                          }
                        >
                          {copy.removeDependency}: {nameOf(id)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {canManage ? (
          <section className="panel" aria-labelledby="stage-add-title">
            <h2 id="stage-add-title" className="panel__title">{copy.addTitle}</h2>
            <p className="panel__lede">{copy.gateHint}</p>

            <label className="field">
              <span className="field-label" id="stage-name">{copy.nameLabel}</span>
              <input
                className="input"
                aria-labelledby="stage-name"
                value={newName}
                disabled={busy}
                onChange={(event) => setNewName(event.target.value)}
              />
            </label>

            <label className="perm-check">
              <input
                type="checkbox"
                checked={newIsGate}
                disabled={busy}
                onChange={(event) => setNewIsGate(event.target.checked)}
              />
              <span>{copy.gate}</span>
            </label>

            <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={addStage}>
              {copy.add}
              {busy ? <ButtonSpinner /> : null}
            </button>
          </section>
        ) : null}
      </main>
    </div>
  );
};
