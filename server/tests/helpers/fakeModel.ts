import 'mingo/init/system';
import { Aggregator, Query } from 'mingo';

type Row = Record<string, any>;

/**
 * A stand-in for a mongoose model backed by an array, for tests that need real query and
 * aggregation SEMANTICS (filtering, sorting, `$group`/`$first`, limits) without a mongod binary.
 *
 * Queries and pipelines are executed by `mingo`, which implements MongoDB's operators, so a wrong
 * `$sort`/`$group` fails here instead of being waved through by a hand-written mock. It does not
 * model indexes, memory limits, or ObjectId ordering; use string ids in fixtures.
 */
export function fakeModel(rows: () => Row[]) {
  return {
    find(filter: Row = {}) {
      let sortSpec: Row | undefined;
      let skipCount = 0;
      let max = Infinity;

      const q: any = {
        sort(spec: Row) {
          sortSpec = spec;
          return q;
        },
        skip(n: number) {
          skipCount = n;
          return q;
        },
        limit(n: number) {
          max = n;
          return q;
        },
        select: () => q,
        lean: () => q,
        then(resolve: (value: Row[]) => unknown, reject: (reason: unknown) => unknown) {
          return Promise.resolve()
            .then(() => {
              let cursor = new Query(filter).find(rows());

              if (sortSpec) cursor = cursor.sort(sortSpec);

              return cursor.all().slice(skipCount, skipCount + max);
            })
            .then(resolve, reject);
        }
      };

      return q;
    },
    countDocuments: async (filter: Row = {}) => new Query(filter).find(rows()).all().length,
    aggregate: async (pipeline: Row[]) => new Aggregator(pipeline).run(rows())
  };
}
