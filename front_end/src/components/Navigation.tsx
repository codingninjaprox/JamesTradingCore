'use client'

import { Fragment } from 'react'
import { Disclosure, Menu, Transition } from '@headlessui/react'
import { Bars3Icon, XMarkIcon, BellIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ThemeSwitch } from './ThemeSwitch'

const navigation = [
  { name: 'Dashboard', href: '/' },
  { name: 'Accounts', href: '/accounts' },
  { name: 'Templates', href: '/templates' },
  { name: 'Settings', href: '/settings' },
]

export function Navigation() {
  const pathname = usePathname()

  return (
    <Disclosure as="nav" className="bg-white dark:bg-gray-800 shadow">
      {({ open }) => (
        <>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 justify-between">
              <div className="flex">
                <div className="flex flex-shrink-0 items-center">
                  <Link href="/" className="text-[14px] md:text-[18px] font-bold text-gray-900 dark:text-white">
                    JamesTradingCore
                  </Link>
                </div>
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  {navigation.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        'inline-flex items-center px-1 pt-1 text-[12px] md:text-[14px] font-medium',
                        pathname === item.href
                          ? 'border-b-2 border-indigo-500 text-gray-900 dark:text-white'
                          : 'text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white'
                      )}
                    >
                      {item.name}
                    </Link>
                  ))}
                </div>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:items-center space-x-4">
                <ThemeSwitch />
                <button
                  type="button"
                  className="rounded-full bg-white dark:bg-gray-800 p-1 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  <span className="sr-only">View notifications</span>
                  <BellIcon className="h-[16px] w-[16px] md:h-[20px] md:w-[20px]" aria-hidden="true" />
                </button>
              </div>
              <div className="-mr-2 flex items-center sm:hidden">
                <Disclosure.Button className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500">
                  <span className="sr-only">Open main menu</span>
                  {open ? (
                    <XMarkIcon className="block h-[16px] w-[16px] md:h-[20px] md:w-[20px]" aria-hidden="true" />
                  ) : (
                    <Bars3Icon className="block h-[16px] w-[16px] md:h-[20px] md:w-[20px]" aria-hidden="true" />
                  )}
                </Disclosure.Button>
              </div>
            </div>
          </div>

          <Disclosure.Panel className="sm:hidden">
            <div className="space-y-1 pb-3 pt-2">
              {navigation.map((item) => (
                <Disclosure.Button
                  key={item.name}
                  as={Link}
                  href={item.href}
                  className={cn(
                    'block py-2 pl-3 pr-4 text-[14px] md:text-[16px] font-medium',
                    pathname === item.href
                      ? 'bg-indigo-50 border-l-4 border-indigo-500 text-indigo-700 dark:bg-gray-700 dark:text-white'
                      : 'text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
                  )}
                >
                  {item.name}
                </Disclosure.Button>
              ))}
              <div className="flex items-center px-4 py-2">
                <ThemeSwitch />
              </div>
            </div>
          </Disclosure.Panel>
        </>
      )}
    </Disclosure>
  )
} 