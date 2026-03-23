---
figureTitle: "Figure"
tableTitle: "Table"
figPrefix: ["Fig.", "Figs."]
tblPrefix: ["Table", "Tables"]
eqPrefix: ["Eq.", "Eqs."]
lstPrefix: ["Listing", "Listings"]
secPrefix: ["Section", "Sections"]
---

# Introduction {#sec:intro}

This document demonstrates all five reference types supported by TurboRef.

## Figures {#sec:figures}

Here is a standalone figure:

![A beautiful sunset](https://picsum.photos/400/200)  {#fig:sunset}

And a sub-figure group:

![A cat sitting](https://picsum.photos/400/200){#fig:cat}
![A playful dog](https://picsum.photos/400/200){#fig:dog}
: Domestic animals comparison {#fig:animals}

We can reference them: see [@fig:sunset] for the sunset, [@fig:cat] for the cat, and [@fig:animals] for the full group. Multiple at once: [@fig:sunset;@fig:cat;@fig:dog].

## Tables {#sec:tables}

| Language | Paradigm | Year |
|----------|----------|------|
| Rust | Systems | 2010 |
| TypeScript | Scripting | 2012 |
| Python | General | 1991 |
: Programming languages overview {#tbl:languages}

| Metric | Before | After |
|--------|--------|-------|
| Bundle size | 200KB | 20KB |
| Parse time | 50ms | 5ms |
: Performance comparison {#tbl:perf}

As shown in [@tbl:languages], Rust is the newest. Compare with [@tbl:perf] for benchmarks. Both tables: [@tbl:languages;@tbl:perf].

## Equations {#sec:equations}

The famous mass-energy equivalence:

$$E = mc^2$$ {#eq:einstein}

And the Pythagorean theorem:

$$
a^2 + b^2 = c^2
$$
{#eq:pythagoras}

An inline equation: $F = ma$ {#eq:newton}

See [@eq:einstein] for Einstein's equation, [@eq:pythagoras] for Pythagoras, and [@eq:newton] for Newton's second law. All three: [@eq:einstein;@eq:pythagoras;@eq:newton].

## Code Listings {#sec:listings}

```rust
fn main() {
    println!("Hello from TurboRef!");
}
```
{#lst:hello}

```python
def fibonacci(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```
{#lst:fib}

See [@lst:hello] for the Rust example and [@lst:fib] for the Python one. Both: [@lst:hello;@lst:fib].

## Cross-type References

This section ties everything together. Refer to [@sec:intro] for the introduction, [@fig:sunset] for the image, [@tbl:languages] for the data, [@eq:einstein] for the math, and [@lst:hello] in [@sec:listings] for the code.

Mixed batch reference: [@fig:sunset;@tbl:languages;@eq:einstein].
