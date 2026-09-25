import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { dispatchNotificationAction } from "@/lib/notifications/dispatch";

type CategoryKey = "hotels" | "activities" | "transport" | "dining";

const categoryConfig: Record<
  CategoryKey,
  {
    title: string;
    table: CategoryKey;
    select: string;
    label: (row: Record<string, unknown>) => string;
    description: (row: Record<string, unknown>) => string | null;
  }
> = {
  hotels: {
    title: "Hotel votes",
    table: "hotels",
    select: "id, name, location, notes",
    label: (row) => String(row.name ?? "Hotel"),
    description: (row) => (typeof row.notes === "string" ? row.notes : null),
  },
  activities: {
    title: "Activity votes",
    table: "activities",
    select: "id, title, location, notes",
    label: (row) => String(row.title ?? "Activity"),
    description: (row) => (typeof row.notes === "string" ? row.notes : null),
  },
  transport: {
    title: "Transport votes",
    table: "transport",
    select: "id, mode, departure_location, arrival_location, notes",
    label: (row) => String(row.mode ?? "Transport"),
    description: (row) =>
      [row.departure_location, row.arrival_location].filter(Boolean).join(" to ") ||
      (typeof row.notes === "string" ? row.notes : null),
  },
  dining: {
    title: "Dining votes",
    table: "dining",
    select: "id, name, location, notes",
    label: (row) => String(row.name ?? "Dining"),
    description: (row) => (typeof row.notes === "string" ? row.notes : null),
  },
};

function schemaError(message: string) {
  if (
    message.toLowerCase().includes("column") ||
    message.toLowerCase().includes("schema") ||
    message.toLowerCase().includes("relation")
  ) {
    return `${message}. The live Supabase schema may be missing the voting tables or planning tables.`;
  }

  return message;
}

function hasParticipantAccess(participant: { status?: string | null; membership_status?: string | null } | null) {
  if (!participant) {
    return false;
  }

  if (
    participant.membership_status === "declined" ||
    participant.membership_status === "removed" ||
    participant.status === "declined"
  ) {
    return false;
  }

  return (
    participant.membership_status === "active" ||
    participant.membership_status === "pending_approval" ||
    participant.membership_status === "invited" ||
    participant.status === "accepted" ||
    participant.status === "pending" ||
    participant.status === "linked" ||
    participant.status === "invited"
  );
}

async function getAuthedUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!token) {
    return { error: NextResponse.json({ error: "Missing user session." }, { status: 401 }) };
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return { error: NextResponse.json({ error: "Invalid user session." }, { status: 401 }) };
  }

  return { user };
}

async function verifyTripAccess(tripId: string, userId: string, userEmail: string) {
  const { data: trip, error: tripError } = await supabaseAdmin
    .from("trips")
    .select("id, owner_id, status, voting_deadline")
    .eq("id", tripId)
    .single();

  if (tripError || !trip) {
    return { error: NextResponse.json({ error: schemaError(tripError?.message || "Trip not found.") }, { status: 404 }) };
  }

  if (trip.owner_id === userId) {
    return { trip, accessRole: "organiser" as const };
  }

  const { data: participantLink, error: participantError } = await supabaseAdmin
    .from("trip_participants")
    .select("id, status, membership_status")
    .eq("trip_id", tripId)
    .or(`user_id.eq.${userId},email.eq.${userEmail}`)
    .maybeSingle();

  if (participantError) {
    return { error: NextResponse.json({ error: schemaError(participantError.message) }, { status: 400 }) };
  }

  if (!hasParticipantAccess(participantLink)) {
    return { error: NextResponse.json({ error: "You do not have access to this trip." }, { status: 403 }) };
  }

  return { trip, accessRole: "participant" as const };
}

async function loadVotingState(tripId: string, participantIds: string[]) {
  const { data: polls, error: pollsError } = await supabaseAdmin
    .from("polls")
    .select("id, title")
    .eq("trip_id", tripId);

  if (pollsError) {
    throw new Error(schemaError(pollsError.message));
  }

  const pollMap = new Map<string, { id: string; title: string }>();
  for (const poll of polls ?? []) {
    pollMap.set(poll.title, poll as { id: string; title: string });
  }

  const { data: options, error: optionsError } = await supabaseAdmin
    .from("options")
    .select("id, category, metadata")
    .eq("trip_id", tripId);

  if (optionsError) {
    throw new Error(schemaError(optionsError.message));
  }

  const optionIdToEntityId = new Map<string, string>();
  for (const option of options ?? []) {
    const metadata = (option.metadata ?? {}) as Record<string, unknown>;
    const entityId = typeof metadata.entityId === "string" ? metadata.entityId : null;
    if (entityId) {
      optionIdToEntityId.set(option.id, entityId);
    }
  }

  const pollIds = (polls ?? []).map((poll) => poll.id);
  const categories = {
    hotels: {
      title: "Hotels",
      uniqueVoterIds: new Set<string>(),
      itemVotes: {} as Record<string, { votes: number; upVotes: number; downVotes: number; voterIds: string[]; upVoterIds: string[]; downVoterIds: string[] }>,
    },
    activities: {
      title: "Activities",
      uniqueVoterIds: new Set<string>(),
      itemVotes: {} as Record<string, { votes: number; upVotes: number; downVotes: number; voterIds: string[]; upVoterIds: string[]; downVoterIds: string[] }>,
    },
    transport: {
      title: "Transport",
      uniqueVoterIds: new Set<string>(),
      itemVotes: {} as Record<string, { votes: number; upVotes: number; downVotes: number; voterIds: string[]; upVoterIds: string[]; downVoterIds: string[] }>,
    },
    dining: {
      title: "Dining",
      uniqueVoterIds: new Set<string>(),
      itemVotes: {} as Record<string, { votes: number; upVotes: number; downVotes: number; voterIds: string[]; upVoterIds: string[]; downVoterIds: string[] }>,
    },
  };

  if (pollIds.length === 0) {
    return Object.fromEntries(
      Object.entries(categories).map(([key, value]) => [
        key,
        {
          title: value.title,
          voterCount: 0,
          eligibleVoterCount: participantIds.length,
          progress: 0,
          itemVotes: {},
        },
      ]),
    );
  }

  const { data: pollOptions, error: pollOptionsError } = await supabaseAdmin
    .from("poll_options")
    .select("id, poll_id, option_id")
    .in("poll_id", pollIds);

  if (pollOptionsError) {
    throw new Error(schemaError(pollOptionsError.message));
  }

  const pollOptionIds = (pollOptions ?? []).map((item) => item.id);
  const pollOptionMap = new Map<string, { poll_id: string; option_id: string | null }>();
  for (const pollOption of pollOptions ?? []) {
    pollOptionMap.set(pollOption.id, {
      poll_id: pollOption.poll_id,
      option_id: pollOption.option_id,
    });
  }

  const { data: votes, error: votesError } = pollOptionIds.length
    ? await supabaseAdmin
        .from("poll_votes")
        .select("poll_id, poll_option_id, voter_id, vote_direction")
        .in("poll_option_id", pollOptionIds)
    : { data: [], error: null };

  if (votesError) {
    throw new Error(schemaError(votesError.message));
  }

  const pollIdToCategory = new Map<string, CategoryKey>();
  for (const [category, config] of Object.entries(categoryConfig) as Array<[CategoryKey, (typeof categoryConfig)[CategoryKey]]>) {
    const poll = pollMap.get(config.title);
    if (poll) {
      pollIdToCategory.set(poll.id, category);
    }
  }

  for (const vote of votes ?? []) {
    if (!participantIds.includes(vote.voter_id)) continue;
    const category = pollIdToCategory.get(vote.poll_id);
    const pollOption = pollOptionMap.get(vote.poll_option_id);
    const entityId = pollOption?.option_id ? optionIdToEntityId.get(pollOption.option_id) : null;

    if (!category || !entityId) {
      continue;
    }

    const categoryState = categories[category];
    const voteKey = vote.voter_id ?? `anon-${vote.poll_option_id}`;
    categoryState.uniqueVoterIds.add(voteKey);

    const voteDirection = vote.vote_direction === "down" ? "down" : "up";
    const current = categoryState.itemVotes[entityId] ?? {
      votes: 0,
      upVotes: 0,
      downVotes: 0,
      voterIds: [],
      upVoterIds: [],
      downVoterIds: [],
    };
    current.upVotes += voteDirection === "up" ? 1 : 0;
    current.downVotes += voteDirection === "down" ? 1 : 0;
    current.votes = current.upVotes;
    if (vote.voter_id) {
      current.voterIds.push(vote.voter_id);
      if (voteDirection === "up") {
        current.upVoterIds.push(vote.voter_id);
      } else {
        current.downVoterIds.push(vote.voter_id);
      }
    }
    categoryState.itemVotes[entityId] = current;
  }

  return Object.fromEntries(
    Object.entries(categories).map(([key, value]) => {
      const voterCount = value.uniqueVoterIds.size;
      const eligibleVoterCount = participantIds.length;
      return [
        key,
        {
          title: value.title,
          voterCount,
          eligibleVoterCount,
          progress: eligibleVoterCount > 0 ? Math.round((voterCount / eligibleVoterCount) * 100) : 0,
          itemVotes: value.itemVotes,
        },
      ];
    }),
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthedUser(request);
  if ("error" in auth) {
    return auth.error;
  }

  const { id: tripId } = await params;
  const userEmail = (auth.user.email ?? "").toLowerCase();
  const access = await verifyTripAccess(tripId, auth.user.id, userEmail);

  if ("error" in access) {
    return access.error;
  }

  const { data: participants, error: participantsError } = await supabaseAdmin
    .from("trip_participants")
    .select("user_id, email, status, membership_status")
    .eq("trip_id", tripId);

  if (participantsError) {
    return NextResponse.json({ error: schemaError(participantsError.message) }, { status: 400 });
  }

  const participantIds = Array.from(
    new Set(
      ((participants ?? []) as Array<{ user_id: string | null; email: string | null; status?: string | null; membership_status?: string | null }>)
        .filter((participant) => participant.membership_status ? participant.membership_status === "active" : participant.status === "accepted")
        .map((participant) => participant.user_id || (participant.email ? `email:${participant.email.toLowerCase()}` : null))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  try {
    const categories = await loadVotingState(tripId, [...new Set([access.trip.owner_id, ...participantIds])]);
    return NextResponse.json({ categories });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load voting." },
      { status: 400 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthedUser(request);
  if ("error" in auth) {
    return auth.error;
  }

  const { id: tripId } = await params;
  const userEmail = (auth.user.email ?? "").toLowerCase();
  const access = await verifyTripAccess(tripId, auth.user.id, userEmail);

  if ("error" in access) {
    return access.error;
  }

  const payload = (await request.json()) as {
    category?: CategoryKey;
    entityId?: string;
    direction?: "up" | "down";
  };

  const category = payload.category;
  const entityId = payload.entityId?.trim();
  const direction = payload.direction === "down" ? "down" : "up";
  let notificationAction = "vote.cast";

  if (!category || !(category in categoryConfig) || !entityId) {
    return NextResponse.json({ error: "Category and entity are required." }, { status: 400 });
  }

  if (["cancelled", "closed", "completed"].includes(access.trip.status) || (access.trip.voting_deadline && Date.parse(access.trip.voting_deadline) <= Date.now())) return NextResponse.json({ error: "Voting is closed. Ask the organiser to reopen it." }, { status: 409 });
  const { data: decision, error: decisionError } = await supabaseAdmin.from("trip_decisions").select("option_id").eq("trip_id", tripId).eq("category", category).maybeSingle();
  if (decisionError) return NextResponse.json({ error: "Unable to check the voting deadline." }, { status: 503 });
  if (decision) return NextResponse.json({ error: "This decision is locked. Ask the organiser to reopen it." }, { status: 409 });
  const config = categoryConfig[category];
  const { data: entityRow, error: entityError } = await supabaseAdmin
    .from(config.table)
    .select(config.select)
    .eq("trip_id", tripId)
    .eq("id", entityId)
    .single();

  if (entityError || !entityRow) {
    return NextResponse.json({ error: schemaError(entityError?.message || "Option not found.") }, { status: 404 });
  }

  const entityRecord = entityRow as unknown as Record<string, unknown>;

  const { data: existingPoll, error: pollError } = await supabaseAdmin
    .from("polls")
    .select("id, title")
    .eq("trip_id", tripId)
    .eq("title", config.title)
    .maybeSingle();

  if (pollError) {
    return NextResponse.json({ error: schemaError(pollError.message) }, { status: 400 });
  }

  let poll = existingPoll;

  if (!poll) {
    const { data: createdPoll, error: createPollError } = await supabaseAdmin
      .from("polls")
      .insert({
        trip_id: tripId,
        created_by: auth.user.id,
        title: config.title,
        description: `Votes for ${category} on this trip.`,
        allows_multiple: true,
      })
      .select("id, title")
      .single();

    if (createPollError || !createdPoll) {
      return NextResponse.json({ error: schemaError(createPollError?.message || "Unable to create poll.") }, { status: 400 });
    }

    poll = createdPoll;
  }

  const { data: existingOption, error: optionError } = await supabaseAdmin
    .from("options")
    .select("id")
    .eq("trip_id", tripId)
    .eq("category", category)
    .filter("metadata->>entityId", "eq", entityId)
    .maybeSingle();

  if (optionError) {
    return NextResponse.json({ error: schemaError(optionError.message) }, { status: 400 });
  }

  let option = existingOption;

  if (!option) {
    const { data: createdOption, error: createOptionError } = await supabaseAdmin
      .from("options")
      .insert({
        trip_id: tripId,
        created_by: auth.user.id,
        category,
        title: config.label(entityRecord),
        description: config.description(entityRecord),
        metadata: { entityId, sourceTable: category },
      })
      .select("id")
      .single();

    if (createOptionError || !createdOption) {
      return NextResponse.json({ error: schemaError(createOptionError?.message || "Unable to create option.") }, { status: 400 });
    }

    option = createdOption;
  }

  const { data: existingPollOption, error: pollOptionError } = await supabaseAdmin
    .from("poll_options")
    .select("id")
    .eq("poll_id", poll.id)
    .eq("option_id", option.id)
    .maybeSingle();

  let pollOption = existingPollOption;

  if (pollOptionError) {
    return NextResponse.json({ error: schemaError(pollOptionError.message) }, { status: 400 });
  }

  if (!pollOption) {
    const { data: createdPollOption, error: createPollOptionError } = await supabaseAdmin
      .from("poll_options")
      .insert({
        poll_id: poll.id,
        option_id: option.id,
        label: config.label(entityRecord),
      })
      .select("id")
      .single();

    if (createPollOptionError || !createdPollOption) {
      return NextResponse.json(
        { error: schemaError(createPollOptionError?.message || "Unable to create poll option.") },
        { status: 400 },
      );
    }

    pollOption = createdPollOption;
  }

  const { data: existingVote, error: existingVoteError } = await supabaseAdmin
    .from("poll_votes")
    .select("id, vote_direction")
    .eq("poll_id", poll.id)
    .eq("poll_option_id", pollOption.id)
    .eq("voter_id", auth.user.id)
    .maybeSingle();

  if (existingVoteError) {
    return NextResponse.json({ error: schemaError(existingVoteError.message) }, { status: 400 });
  }

  if (existingVote?.vote_direction === direction) {
    notificationAction = "vote.removed";
    const { error: deleteVoteError } = await supabaseAdmin
      .from("poll_votes")
      .delete()
      .eq("id", existingVote.id);

    if (deleteVoteError) {
      return NextResponse.json({ error: schemaError(deleteVoteError.message) }, { status: 400 });
    }
  } else if (existingVote) {
    const { error: updateVoteError } = await supabaseAdmin
      .from("poll_votes")
      .update({ vote_direction: direction })
      .eq("id", existingVote.id);

    if (updateVoteError) {
      return NextResponse.json({ error: schemaError(updateVoteError.message) }, { status: 400 });
    }
  } else {
    const { error: insertVoteError } = await supabaseAdmin.from("poll_votes").insert({
      poll_id: poll.id,
      poll_option_id: pollOption.id,
      voter_id: auth.user.id,
      vote_direction: direction,
      voter_name:
        typeof auth.user.user_metadata?.full_name === "string"
          ? auth.user.user_metadata.full_name
          : auth.user.email ?? "Traveller",
    });

    if (insertVoteError) {
      return NextResponse.json({ error: schemaError(insertVoteError.message) }, { status: 400 });
    }
  }

  const { data: participants, error: participantsError } = await supabaseAdmin
    .from("trip_participants")
    .select("user_id, email, status, membership_status")
    .eq("trip_id", tripId);

  if (participantsError) {
    return NextResponse.json({ error: schemaError(participantsError.message) }, { status: 400 });
  }

  void dispatchNotificationAction({
    actionKey: notificationAction,
    tripId,
    actorUserId: auth.user.id,
    title: notificationAction === "vote.removed" ? "A vote was removed" : "A new vote was added",
    message: `${auth.user.user_metadata?.full_name || auth.user.email || "A traveller"} ${notificationAction === "vote.removed" ? "removed a vote from" : "voted on"} ${config.label(entityRecord)}.`,
    url: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/trips/${tripId}/voting`,
    context: { category, entityId, direction },
  }).catch((error) => {
    console.error("Unable to dispatch vote notification", error);
  });

  const participantIds = Array.from(
    new Set(
      ((participants ?? []) as Array<{ user_id: string | null; email: string | null; status?: string | null; membership_status?: string | null }>)
        .filter((participant) => participant.membership_status ? participant.membership_status === "active" : participant.status === "accepted")
        .map((participant) => participant.user_id || (participant.email ? `email:${participant.email.toLowerCase()}` : null))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  try {
    const categories = await loadVotingState(tripId, [...new Set([access.trip.owner_id, ...participantIds])]);
    return NextResponse.json({ categories });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to refresh voting." },
      { status: 400 },
    );
  }
}
