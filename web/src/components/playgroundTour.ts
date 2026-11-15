import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

/*
 * The Playground manual: a driver.js tour over every control. It starts each time the Playground opens; every step
 * has Skip, and the "?" button in the dock replays it. Steps that point inside a modal or the inspector open it first
 * (`prep`), so the tour shows the real UI in either direction.
 */

export type TourModal = "files" | "learn" | "settings" | null;

export type TourControls = {
  setModal: (m: TourModal) => void;
  setInspector: (open: boolean) => void;
  demo: boolean;
};

type Step = DriveStep & { prep?: () => void };

const sel = (name: string) => `[data-tour="${name}"]`;

function buildSteps(c: TourControls): Step[] {
  const closed = () => {
    c.setModal(null);
    c.setInspector(false);
  };
  const inspector = () => {
    c.setModal(null);
    c.setInspector(true);
  };
  const modal = (m: TourModal) => () => {
    c.setInspector(false);
    c.setModal(m);
  };
  return [
    {
      prep: closed,
      popover: {
        title: "Welcome to the Klew Playground",
        description:
          "Klew gives coding agents a small, token-budgeted map of the code that matters, found by walking a code graph in HydraDB, and it learns from every change you confirm. This one-minute guide walks through every part of the screen. Skip it any time; the <b>?</b> button in the left dock replays it.",
      },
    },
    {
      element: sel("task"),
      prep: closed,
      popover: {
        title: "1 · Describe a task",
        description:
          "Write what you want the agent to do, like an issue title or a commit message. Press <b>Enter</b> or <b>Unwind Context</b>. Klew finds the files that matter and packs their key code into the token budget." +
          (c.demo ? " On this free server a query takes a few seconds; on a laptop it's about 0.3 s." : ""),
        side: "top",
      },
    },
    {
      element: sel("examples"),
      prep: closed,
      popover: {
        title: "Example tasks",
        description: "Not sure what to type? These are real tasks for the httpx repository. Click one to run it.",
        side: "top",
      },
    },
    {
      element: sel("chips"),
      prep: closed,
      popover: {
        title: "Repository, budget and pack size",
        description:
          "<b>repo</b> is the code graph you're querying. <b>budget</b> is how many tokens of context the agent gets (2,000 by default, the same budget used in our evaluation). <b>files packed</b> is how many files fit into that budget; click it to see them all.",
        side: "top",
      },
    },
    {
      prep: closed,
      popover: {
        title: "2 · The graph",
        description:
          "Each run draws the path from your task to the files Klew chose.<br><br>" +
          "<b>Amber hub</b>: your task, where every thread starts.<br>" +
          "<b>Dark nodes</b>: packed files, labelled with their rank (#1 is the most relevant; the selected file turns green).<br>" +
          "<b>White nodes</b>: functions and classes the walk passed through.<br>" +
          "<b>Green links</b>: learned from past changes, tested-by, or changes-together. <b>Grey links</b>: code structure (calls, imports, contains).<br>" +
          "<b>Moving dots</b>: the direction of each thread. Select a file and its whole thread lights up in amber.<br><br>Click a node to inspect it, drag to move it, scroll to zoom.",
      },
    },
    {
      element: sel("graph-controls"),
      prep: closed,
      popover: {
        title: "Graph controls",
        description:
          "Zoom in and out, or <b>Fit view</b> to bring every node back on screen. By default the graph shows the top 12 files; <b>All files</b> shows the whole pack. When you've selected a file, <b>Show all threads</b> clears the focus.",
        side: "bottom",
      },
    },
    {
      element: sel("dock"),
      prep: closed,
      popover: {
        title: "3 · The tool dock",
        description:
          "From the top: <b>Context Files</b> (every packed file), <b>Teach</b> (tell Klew what you changed), <b>Budget & Graph Stats</b>, the <b>file inspector</b>, <b>Use your repo</b>, and this <b>guide</b>. We'll open each one.",
        side: "right",
      },
    },
    {
      element: sel("inspector"),
      prep: inspector,
      popover: {
        title: "4 · The file inspector",
        description:
          "Everything about one packed file. Click any file node on the graph, or any file in the pack list, to open it here.",
        side: "left",
      },
    },
    {
      element: sel("inspector-nav"),
      prep: inspector,
      popover: {
        title: "Move through the pack",
        description:
          "<b>#1 of N</b> is this file's rank in the pack. The arrows step to the previous and next file. <b>All files</b> opens the full list, and <b>×</b> minimizes the inspector so the graph has the room.",
        side: "bottom",
      },
    },
    {
      element: sel("inspector-meta"),
      prep: inspector,
      popover: {
        title: "Path, score and cost",
        description:
          "<b>score</b> is how strongly the graph points at this file: higher means more relevant. <b>tok</b> is how much of the budget it uses. <b>symbols</b> is how many of its functions and classes made it into the pack.",
        side: "left",
      },
    },
    {
      element: sel("evidence"),
      prep: inspector,
      popover: {
        title: "Evidence: why this file?",
        description:
          "What in your task pointed here. <b>Name match</b>: the file's name matches your words. <b>Mentions</b>: you named something defined in it. <b>Learned</b>: past changes taught Klew that this word leads here (green dot). If there's no evidence, the file was reached by walking the graph.",
        side: "left",
      },
    },
    {
      element: sel("thread"),
      prep: inspector,
      popover: {
        title: "Thread: how Klew got here",
        description:
          "The exact path through the code graph, step by step: which function calls, imports, tests or changes-with links led from your task to this file. Every file the agent sees comes with this reason.",
        side: "left",
      },
    },
    {
      element: sel("inspector-actions"),
      prep: inspector,
      popover: {
        title: "Mark it, or read the code",
        description:
          "<b>Mark as changed</b> tells Klew you edited this file for the task (used by Teach). <b>View code</b> shows the exact snippet the agent receives.",
        side: "top",
      },
    },
    {
      element: sel("files-modal"),
      prep: modal("files"),
      popover: {
        title: "5 · Every packed file",
        description:
          "The whole context pack: each file with its rank, score, token cost and a short reason. Click a file to inspect it, or <b>Changed</b> to mark it.",
        side: "top",
      },
    },
    {
      element: sel("teach-modal"),
      prep: modal("learn"),
      popover: {
        title: "6 · Teach: how Klew learns",
        description:
          "After a change lands, tick the files you actually edited and press <b>Reinforce</b>. Klew strengthens the links from your task's words to those files and weakens links to files it served that you didn't need. The code graph itself never changes, only the learned links." +
          (c.demo ? " On this public demo, teaching is shared with other visitors and resets when the server restarts." : "") +
          " In real use, the GitHub Action does this automatically on every merged PR.",
        side: "top",
      },
    },
    {
      element: sel("settings-repo"),
      prep: modal("settings"),
      popover: {
        title: "7 · Pick a repository",
        description:
          "Switch between the indexed code graphs (here, httpx and flask). The next query runs on the one you pick. The dot shows whether you're connected to a live HydraDB.",
        side: "bottom",
      },
    },
    {
      element: sel("settings-budget"),
      prep: modal("settings"),
      popover: {
        title: "Token budget",
        description:
          "How much context the agent gets, from 500 to 4,000 tokens. Moving the slider re-runs your task with the new budget, so you can watch files join or leave the pack.",
        side: "top",
      },
    },
    {
      element: sel("settings-stats"),
      prep: modal("settings"),
      popover: {
        title: "Graph stats",
        description:
          "How big the selected graph is (files and symbols), and how long your last query took, with the number of HydraDB queries it ran.",
        side: "top",
      },
    },
    {
      element: sel("byo"),
      prep: closed,
      popover: {
        title: "8 · Use your own repo",
        description:
          "Want Klew on your codebase? Connecting your own repository is coming with team graphs. Click here to join the waitlist.",
        side: "right",
      },
    },
    {
      element: sel("help"),
      prep: closed,
      popover: {
        title: "That's everything",
        description: "Try a task now. You can replay this guide any time with the <b>?</b> button.",
        side: "right",
        doneBtnText: "Start exploring",
      },
    },
  ];
}

export function startPlaygroundTour(c: TourControls, onDone?: () => void): Driver {
  const steps = buildSteps(c);
  const go = (to: number) => {
    steps[to]?.prep?.();
    // Let React render the modal/inspector the step needs; driver.js then waits for the element if necessary.
    window.setTimeout(() => d.moveTo(to), 80);
  };
  const d: Driver = driver({
    steps,
    showProgress: true,
    progressText: "{{current}} of {{total}}",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    popoverClass: "klew-tour",
    overlayColor: "#172a38",
    overlayOpacity: 0.42,
    stagePadding: 8,
    stageRadius: 18,
    allowClose: true,
    overlayClickBehavior: "none",
    disableActiveInteraction: true,
    waitForElement: 4000,
    smoothScroll: true,
    onNextClick: (_el, _step, { driver: drv }) => {
      const i = drv.getActiveIndex() ?? 0;
      if (drv.isLastStep()) drv.destroy();
      else go(i + 1);
    },
    onPrevClick: (_el, _step, { driver: drv }) => {
      const i = drv.getActiveIndex() ?? 0;
      if (i > 0) go(i - 1);
    },
    onPopoverRender: (popover, { driver: drv }) => {
      if (drv.isLastStep()) return;
      const skip = document.createElement("button");
      skip.type = "button";
      skip.textContent = "Skip guide";
      skip.className = "klew-tour-skip";
      skip.addEventListener("click", () => drv.destroy());
      popover.footer.insertBefore(skip, popover.footer.firstChild);
    },
    onDestroyed: () => {
      c.setModal(null);
      onDone?.();
    },
  });
  steps[0].prep?.();
  d.drive(0);
  return d;
}
