## 1. ET's collection

- [x] 1.1 Port `et-generator.js`'s computation of a composite, and test that its graph builds offline
- [x] 1.2 Add the `collections` task: check the collection, export the missing composites, wait for them and record them; test it against a fake Earth Engine
- [x] 1.3 Add the `compare` task: compare a multiband asset with a collection over a date range and write the report; test the statistics and the report
- [x] 1.4 Document both tasks in the jobs README, and add `collections` to the daily run's arguments

## 2. Review

- [x] 2.1 Know the collection's images by their asset name, not the listing's display id
- [x] 2.2 Stop waiting for running exports an hour after the last one may start, and leave them to the next run
- [x] 2.3 Test the Earth Engine side of the collections task, with `ee.data` answering for the server
- [x] 2.4 Keep progress out of the jobs README
- [x] 2.5 Add `collections` to the daily run only where Terraform's `jobs_collections` is on, off by default

## 3. Close

- [x] 3.1 Archive the change
