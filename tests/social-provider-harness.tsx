import { renderToStaticMarkup } from 'react-dom/server';
import { GuildProvider, useGuild } from '../src/guild/GuildProvider';
import { SocialProvider, useSocial } from '../src/social/SocialProvider';
import { setReadiness } from './social-provider-sdk';

function GuildStatus() { return <output>{useGuild().ready ? 'ready' : 'loading'}</output>; }
function SocialStatus() { return <output>{useSocial().ready ? 'ready' : 'loading'}</output>; }
export function renderStatus(group: string, readiness: Record<string, boolean>) {
  setReadiness(readiness);
  return group === 'guild'
    ? renderToStaticMarkup(<GuildProvider><GuildStatus /></GuildProvider>)
    : renderToStaticMarkup(<SocialProvider><SocialStatus /></SocialProvider>);
}
