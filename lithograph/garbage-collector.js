const { Seq, Record, List, Map } = require("immutable");
const { Cause, IO, field, event, update } = require("@cause/cause");

const Request = Record({ id:-1, resolve:-1 }, "Request");
const Allocation = Record({ id:-1, type:-1 }, "Allocation");


const GarbageCollector = Cause("GarbageCollector",
{
    [field `ready`]: false,
    [field `allocate`]: -1,
    [field `allocateIO`]: IO.start(toAllocateIO),

    [event.in `AllocateReady`]: { allocate: -1 },
    [event.on `AllocateReady`]: (endpoints, { allocate }) =>
    [
        endpoints
            .set("allocate", allocate)
            .set("ready", true),
        [Cause.Ready()]
    ],

    [event.out `Allocate`]: { id:-1, type: -1 },
    [event.in `Request`]: { scope: -1, type: -1, resolve: -1 },
    [event.on `Request`](collector, request)
    {
        const id = collector.requests.get("id");
        const updated = collector.update("requests",
            requests => requests.concat([["id", id + 1], [id, request]]));
        const allocate = GarbageCollector.Allocate({ id, type: request.type });

        return [updated, [allocate]];
    },

    [field `requests`]: Map({ id: 0 }),
    [field `allocations`]: Map(),
    [field `resolutions`]: List(),

    [event.in `Allocated`]: { id: -1, resource:-1 },
    [event.on `Allocated`](collector, allocation)
    {
        const { id, resource } = allocation;
        const { scope, resolve } = collector.requests.get(id);
        const resolution = IO.start(() => resolve({ resource }));

        return collector
            .updateIn(["allocations", scope], List(), list => list.push(id))
            .update("resolutions", list => list.push(resolution));
    },

    [event.out `Deallocate`]: { ids:List() },

    [event.in `ScopesExited`]: { scopes: -1 },
    [event.on `ScopesExited`](collector, { scopes })
    {
        const updated = collector.update("allocations",
            allocations => scopes.reduce(
                (allocations, scope) => allocations.delete(scope),
                allocations));
        const allocations = scopes
            .map(scope => collector.allocations.get(scope, List()))
            .flatten();

        const events =
            allocations.size > 0 &&
            [GarbageCollector.Deallocate({ ids:allocations.toList() })];

        return [updated, events || []];
    }
});

module.exports = GarbageCollector;

function toAllocateIO(push)
{
    push(GarbageCollector.AllocateReady({ allocate }));

    function allocate(scope, type)
    {
        return new Promise(function (resolve, reject)
        {
            // If for whatever reason we don't find a matching scope, we'll have
            // to return an error immediately.
            if (scope === false)
                return reject(
                    Error("A browser was attempted to be created out of scope"));

            const sanitize = ({ error, resource }) =>
                void(typeof error === "function" ?
                    reject(error()) : resolve(resource));

            push(GarbageCollector.Request({ scope, resolve: sanitize, type }));
        });
    }
}
