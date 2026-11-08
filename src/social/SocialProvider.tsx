import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useProcedure, useReducer, useTable } from 'spacetimedb/react';
import { procedures, reducers, tables } from '../module_bindings';
import type { FriendCard, FriendRequestCard, PartyCard, PartyInviteCard, PartyMemberCard, PhotoVerdict } from '../module_bindings/types';

export type SocialState = {
  friends: readonly FriendCard[];
  requests: readonly FriendRequestCard[];
  invites: readonly PartyInviteCard[];
  party: PartyCard | null;
  partyMembers: readonly PartyMemberCard[];
  ready: boolean;
  sendFriendRequest: (username: string) => Promise<void>;
  respondFriendRequest: (requestId: bigint, accept: boolean) => Promise<void>;
  removeFriend: (username: string) => Promise<void>;
  createParty: () => Promise<void>;
  inviteToParty: (username: string) => Promise<void>;
  respondPartyInvite: (inviteId: bigint, accept: boolean) => Promise<void>;
  leaveParty: () => Promise<void>;
  setPartyQuest: (templateId: string) => Promise<void>;
  submitPartyQuestPhoto: (image: string) => Promise<PhotoVerdict>;
};

export const SocialContext = createContext<SocialState | null>(null);

export function SocialProvider({ children }: { children: ReactNode }) {
  const [friends, friendsReady] = useTable(tables.myFriends);
  const [requests, requestsReady] = useTable(tables.myFriendRequests);
  const [invites, invitesReady] = useTable(tables.myPartyInvites);
  const [party, partyReady] = useTable(tables.myParty);
  const [partyMembers, membersReady] = useTable(tables.myPartyMembers);
  const sendRequest = useReducer(reducers.sendFriendRequest);
  const respondRequest = useReducer(reducers.respondFriendRequest);
  const remove = useReducer(reducers.removeFriend);
  const create = useReducer(reducers.createParty);
  const invite = useReducer(reducers.inviteToParty);
  const respondInvite = useReducer(reducers.respondPartyInvite);
  const leave = useReducer(reducers.leaveParty);
  const setQuest = useReducer(reducers.setPartyQuest);
  const submitPhoto = useProcedure(procedures.submitPartyQuestPhoto);

  const value = useMemo<SocialState>(() => ({
    friends, requests, invites, party: party[0] ?? null, partyMembers,
    ready: friendsReady && requestsReady && invitesReady && partyReady && membersReady,
    sendFriendRequest: username => sendRequest({ username }),
    respondFriendRequest: (requestId, accept) => respondRequest({ requestId, accept }),
    removeFriend: username => remove({ username }),
    createParty: () => create(),
    inviteToParty: username => invite({ username }),
    respondPartyInvite: (inviteId, accept) => respondInvite({ inviteId, accept }),
    leaveParty: () => leave(),
    setPartyQuest: templateId => setQuest({ templateId }),
    submitPartyQuestPhoto: image => submitPhoto({ image }),
  }), [friends, requests, invites, party, partyMembers, friendsReady, requestsReady, invitesReady, partyReady, membersReady, sendRequest, respondRequest, remove, create, invite, respondInvite, leave, setQuest, submitPhoto]);

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const social = useContext(SocialContext);
  if (!social) throw new Error('useSocial must be used inside SocialProvider.');
  return social;
}
