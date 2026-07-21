import Image from "next/image";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CONNECTIONS = [
  {
    label: "01",
    title: "Teachers meet opportunity",
    body: "Publish your skill, set weekly availability, and get requests from schools and students nearby.",
  },
  {
    label: "02",
    title: "Learners find the right guide",
    body: "Discover teachers and academies close to your locality.",
  },
  {
    label: "03",
    title: "Institutions stay on schedule",
    body: "Schools, colleges, and academies match tutors to batches and keep cultural classes on rhythm.",
  },
] as const;

const AUDIENCES = [
  {
    title: "Teachers",
    body: "Share your craft and get discovered where you teach.",
  },
  {
    title: "Students",
    body: "Find nearby classes that fit your art and schedule.",
  },
  {
    title: "Schools & colleges",
    body: "Request and assign teachers for the slots you need.",
  },
  {
    title: "Academies",
    body: "Grow your studio with students and trusted tutors.",
  },
] as const;

export function LandingPage() {
  return (
    <div className="bg-[#f7f1e8] text-[#1f1a17]">
      <section className="relative isolate flex min-h-[100svh] flex-col">
        <header className="relative z-20 flex w-full items-center justify-between bg-[#f7f1e8] px-5 py-5 sm:px-8 lg:px-10">
          <Link
            href="/"
            className="font-heading text-2xl font-semibold tracking-tight text-[#1f1a17] lowercase"
            aria-label="CultureBeats home"
          >
            cb.
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-[#2c2926] underline-offset-4 transition-colors hover:text-[#1f1a17] hover:underline active:underline focus-visible:underline"
          >
            Sign in
          </Link>
        </header>

        <div className="grid flex-1 lg:grid-cols-2">
          <div className="flex flex-col justify-center bg-[#f7f1e8] px-5 py-14 sm:px-8 sm:py-16 lg:px-10 lg:py-20">
            <div className="max-w-lg">
              <h1 className="landing-fade-up font-heading text-5xl font-semibold tracking-tight text-[#1f1a17] sm:text-6xl md:text-7xl">
                CultureBeats
              </h1>
              <p className="landing-fade-up landing-fade-up-delay-1 mt-5 max-w-md text-base leading-relaxed text-[#5c534c] sm:text-lg">
                Connect teachers with schools, students with nearby academies,
                and learning with the people who keep Indian arts alive.
              </p>
              <div className="landing-fade-up landing-fade-up-delay-2 mt-8">
                <Link
                  href="/signup"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-11 bg-[#1f1a17] px-7 text-base text-[#f7f1e8] hover:bg-[#2c2520]",
                  )}
                >
                  Get started
                </Link>
              </div>
            </div>
          </div>

          <div className="relative min-h-[48svh] overflow-hidden lg:min-h-full">
            <Image
              src="/landing/hero-tabla-v2.jpg"
              alt="Pair of Indian tabla drums"
              fill
              priority
              className="landing-ken object-cover object-center"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </div>
      </section>

      <section className="bg-[#efe6da]">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 md:py-32">
          <div className="max-w-2xl">
            <p className="landing-reveal text-xs font-medium uppercase tracking-[0.18em] text-[#b56a1a]">
              How it works
            </p>
            <h2 className="landing-reveal mt-3 font-heading text-3xl font-semibold tracking-tight text-[#1f1a17] sm:text-4xl">
              Teachers, learners, and institutions — connected in one place.
            </h2>
          </div>

          <ol className="mt-14 grid gap-4 md:grid-cols-3 md:gap-5">
            {CONNECTIONS.map((item) => (
              <li
                key={item.label}
                className="landing-reveal rounded-xl bg-white px-5 py-6 sm:px-6"
              >
                <span className="font-heading text-sm font-semibold tabular-nums text-[#c47a22]">
                  {item.label}
                </span>
                <h3 className="mt-3 font-heading text-xl font-semibold text-[#1f1a17]">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#5c534c] sm:text-[0.95rem]">
                  {item.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-[#f7f1e8]">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 md:py-32">
          <div className="max-w-2xl">
            <p className="landing-reveal text-xs font-medium uppercase tracking-[0.18em] text-[#b56a1a]">
              Who it’s for
            </p>
            <h2 className="landing-reveal mt-3 font-heading text-3xl font-semibold tracking-tight text-[#1f1a17] sm:text-4xl">
              Built for every side of the room.
            </h2>
            <p className="landing-reveal mt-4 max-w-md text-base leading-relaxed text-[#5c534c]">
              Whether you teach, learn, or run a school or academy — this is a
              place for you.
            </p>
          </div>

          <ul className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2">
            {AUDIENCES.map((item, index) => (
              <li key={item.title} className="landing-reveal">
                <span className="font-heading text-sm font-semibold tabular-nums text-[#c47a22]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 font-heading text-2xl font-semibold tracking-tight text-[#1f1a17]">
                  {item.title}
                </h3>
                <p className="mt-2 max-w-sm text-base leading-relaxed text-[#5c534c]">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-[#efe6da]">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-24 sm:flex-row sm:items-end sm:justify-between sm:gap-16 sm:px-8 md:py-32">
          <div className="max-w-xl">
            <p className="landing-reveal text-xs font-medium uppercase tracking-[0.18em] text-[#b56a1a]">
              Nearby
            </p>
            <h2 className="landing-reveal mt-3 font-heading text-3xl font-semibold tracking-tight text-[#1f1a17] sm:text-4xl md:text-5xl">
              Find what’s near you.
            </h2>
            <p className="landing-reveal mt-5 text-base leading-relaxed text-[#5c534c] sm:text-lg">
              Starting in Mangalore and Udupi — discover teachers and academies
              close to your locality.
            </p>
          </div>

          <div className="landing-reveal flex shrink-0 flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 bg-[#1f1a17] px-7 text-base text-[#f7f1e8] hover:bg-[#2c2520]",
              )}
            >
              Get started
            </Link>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-11 border-[#cbbba6] bg-transparent px-7 text-base text-[#1f1a17] hover:bg-white/70",
              )}
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
