import { SKILLS, skillProgressionForXp } from '../../shared/progression';
import { SkillIcon } from '../ui/icons';
import { usePlayer } from './PlayerProvider';

export function SkillProgress() {
  const { player, ready, error } = usePlayer();
  if (!ready || !player || error) return null;
  return (
    <section className="skills-section" aria-labelledby="skills-heading">
      <h2 id="skills-heading">Skills</h2>
      <div className="skill-grid">
        {SKILLS.map(({ key, category }) => {
          const skill = skillProgressionForXp(player[key]);
          return (
            <article key={key} className="skill-card" aria-label={`${category} progression`}>
              <div className="skill-heading">
                <SkillIcon skill={category} />
                <h3>{category}</h3>
                <span className="skill-level">Level {skill.level}</span>
              </div>
              <p className="skill-title">{skill.title}</p>
              <p className="skill-total">{skill.totalXp.toLocaleString()} XP</p>
              <div className="xp-meter" role="progressbar" aria-label={`${category} ${skill.isMaxLevel ? 'maximum level' : `progress toward level ${skill.nextLevel}`}`}
                aria-valuemin={0} aria-valuemax={skill.isMaxLevel ? 100 : skill.xpRequired}
                aria-valuenow={skill.isMaxLevel ? 100 : skill.xpIntoLevel}
                aria-valuetext={skill.isMaxLevel ? 'Maximum skill level reached' : `${skill.xpIntoLevel.toLocaleString()} of ${skill.xpRequired.toLocaleString()} XP`}>
                <div className="xp-meter-fill" style={{ width: `${skill.progressPercent}%` }} />
              </div>
              <p className="skill-next">{skill.isMaxLevel ? 'Maximum level reached' : `${skill.xpRemaining.toLocaleString()} XP to level ${skill.nextLevel}`}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
