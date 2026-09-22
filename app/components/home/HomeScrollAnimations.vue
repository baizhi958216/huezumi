<script setup lang="ts">
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { nextTick, onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

gsap.registerPlugin(ScrollTrigger)

const marker = useTemplateRef<HTMLSpanElement>('marker')
let mediaContext: ReturnType<typeof gsap.matchMedia> | null = null

function revealSectionHeader(section: HTMLElement) {
  const headerItems = section.querySelectorAll<HTMLElement>('.home-section-header > *')
  if (!headerItems.length)
    return

  gsap.fromTo(headerItems, {
    y: 28,
    autoAlpha: 0,
  }, {
    y: 0,
    autoAlpha: 1,
    duration: 0.7,
    stagger: 0.12,
    ease: 'power3.out',
    scrollTrigger: {
      trigger: section,
      start: 'top 82%',
      // Keep the entrance reversible so returning up the page restores its
      // pre-entry state instead of leaving every section permanently played.
      toggleActions: 'play none none reverse',
    },
  })
}

onMounted(async () => {
  await nextTick()

  const page = marker.value?.parentElement
  if (!page)
    return

  mediaContext = gsap.matchMedia()
  mediaContext.add({
    reduceMotion: '(prefers-reduced-motion: reduce)',
    wideScreen: '(min-width: 641px)',
  }, (context) => {
    if (context.conditions?.reduceMotion)
      return

    const scope = gsap.context(() => {
      const hero = page.querySelector<HTMLElement>('.hero-section')
      const heroItems = hero?.querySelectorAll<HTMLElement>('.hero-content > *')
      if (hero && heroItems?.length) {
        gsap.fromTo(heroItems, {
          y: 26,
          autoAlpha: 0,
        }, {
          y: 0,
          autoAlpha: 1,
          duration: 0.68,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: hero,
            start: 'top 85%',
            toggleActions: 'play none none reverse',
          },
        })
      }

      const gallery = page.querySelector<HTMLElement>('.gallery-section')
      if (gallery) {
        revealSectionHeader(gallery)
        gallery.querySelectorAll<HTMLElement>('.gallery-piece').forEach((piece, index) => {
          const motion = piece.querySelector<HTMLElement>('.gallery-piece__motion')
          if (!motion)
            return

          const entrance = context.conditions?.wideScreen
            ? { x: index % 2 === 0 ? -36 : 36 }
            : { y: 26 }

          gsap.fromTo(motion, {
            ...entrance,
            autoAlpha: 0,
          }, {
            x: 0,
            y: 0,
            autoAlpha: 1,
            duration: 0.72,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: piece,
              start: 'top 86%',
              toggleActions: 'play none none reverse',
            },
          })

          if (context.conditions?.wideScreen) {
            gsap.to(motion, {
              yPercent: -3,
              ease: 'none',
              scrollTrigger: {
                trigger: piece,
                start: 'top bottom',
                end: 'bottom top',
                scrub: 0.45,
              },
            })
          }
        })
      }

      const workflow = page.querySelector<HTMLElement>('.pipeline-section')
      if (workflow) {
        const introItems = workflow.querySelectorAll<HTMLElement>('.pipeline-intro > *')
        if (introItems.length) {
          gsap.fromTo(introItems, {
            y: 28,
            autoAlpha: 0,
          }, {
            y: 0,
            autoAlpha: 1,
            duration: 0.62,
            stagger: 0.09,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: workflow,
              start: 'top 78%',
              toggleActions: 'play none none reverse',
            },
          })
        }

        workflow.querySelectorAll<HTMLElement>('.pipeline-step-item').forEach((step) => {
          const number = step.querySelector<HTMLElement>('.pipeline-step-item__num')
          const content = step.querySelector<HTMLElement>('.pipeline-step-item__content')
          const line = step.querySelector<HTMLElement>('.pipeline-step-item__line')

          if (number) {
            gsap.fromTo(number, {
              scale: 0.72,
              autoAlpha: 0,
            }, {
              scale: 1,
              autoAlpha: 1,
              duration: 0.42,
              ease: 'back.out(1.5)',
              scrollTrigger: {
                trigger: step,
                start: 'top 80%',
                toggleActions: 'play none none reverse',
              },
            })
          }

          if (content) {
            gsap.fromTo(content, {
              x: 30,
              autoAlpha: 0,
            }, {
              x: 0,
              autoAlpha: 1,
              duration: 0.58,
              ease: 'power3.out',
              scrollTrigger: {
                trigger: step,
                start: 'top 78%',
                toggleActions: 'play none none reverse',
              },
            })
          }

          if (line) {
            gsap.fromTo(line, {
              scaleY: 0,
              transformOrigin: 'top center',
            }, {
              scaleY: 1,
              ease: 'none',
              scrollTrigger: {
                trigger: step,
                start: 'top 78%',
                end: 'bottom 62%',
                scrub: 0.35,
              },
            })
          }
        })
      }

      const faq = page.querySelector<HTMLElement>('.faq-section')
      if (faq) {
        const intro = faq.querySelector<HTMLElement>('.faq-intro')
        const accordionItems = faq.querySelectorAll<HTMLElement>('.faq-accordion-item')
        if (intro) {
          gsap.fromTo(intro, {
            x: -28,
            autoAlpha: 0,
          }, {
            x: 0,
            autoAlpha: 1,
            duration: 0.7,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: faq,
              start: 'top 78%',
              toggleActions: 'play none none reverse',
            },
          })
        }
        if (accordionItems.length) {
          gsap.fromTo(accordionItems, {
            x: 30,
            autoAlpha: 0,
          }, {
            x: 0,
            autoAlpha: 1,
            duration: 0.58,
            stagger: 0.1,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: faq.querySelector('.faq-content'),
              start: 'top 80%',
              toggleActions: 'play none none reverse',
            },
          })
        }

        const finale = faq.querySelector<HTMLElement>('.page-finale')
        const finaleArt = finale?.querySelector<HTMLElement>('.page-finale__art')
        const finaleContent = finale?.querySelectorAll<HTMLElement>('.page-finale__badge, .page-finale__title, .page-finale__subtitle, .page-finale__actions')
        if (finale && finaleArt && finaleContent?.length) {
          const timeline = gsap.timeline({
            scrollTrigger: {
              trigger: finale,
              start: 'top 78%',
              toggleActions: 'play none none reverse',
            },
          })
          timeline.fromTo(finaleArt, {
            scale: 0.82,
            rotation: -17,
            autoAlpha: 0,
          }, {
            scale: 1,
            rotation: -7,
            autoAlpha: 1,
            duration: 0.6,
            ease: 'back.out(1.35)',
          })
          timeline.fromTo(finaleContent, {
            y: 26,
            autoAlpha: 0,
          }, {
            y: 0,
            autoAlpha: 1,
            duration: 0.58,
            stagger: 0.09,
            ease: 'power3.out',
          }, '-=0.22')
        }
      }
    }, page)

    ScrollTrigger.refresh()
    return () => scope.revert()
  })
})

onBeforeUnmount(() => {
  mediaContext?.revert()
  mediaContext = null
})
</script>

<template>
  <span ref="marker" class="home-scroll-animations" aria-hidden="true" />
</template>
