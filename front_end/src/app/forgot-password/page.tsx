'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/utils/translation';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { translations, setLanguage } = useLanguage();
    const t = (key: string) => getTranslation(translations, key);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/forgot-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (response.ok) {
                setMessage(t(data.message));
                // Redirect to login page after 3 seconds
                setTimeout(() => {
                    router.push('/login');
                }, 3000);
            } else {
                setError(t(data.message));
            }
        } catch (err) {
            setError(t('An error occurred. Please try again.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col justify-center items-center px-4 md:px-2 pt-6 sm:pt-0 bg-[#12181F]">
            <div className="max-w-[370px] w-full sm:max-w-md md:mx-6 px-2 py-2 md:px-6 md:py-4 shadow-md overflow-hidden sm:rounded-lg" style={{ background: '#252e39', borderRadius: '37px' }}>
                <div className="flex flex-col justify-center items-center px-2 pt-2 md:pt-6 sm:pt-0">
                    <Link href="/">
                        <Image
                            src="/images/logo.svg"
                            alt="Logo"
                            width={250}
                            height={100}
                            className="w-[200px] md:w-[250px]"
                        />
                    </Link>
                </div>
                <div style={{ borderRadius: '37px' }} className="bg-[#12181F] px-6 py-4">
                    <div className="flex mb-2 items-center justify-end">
                        <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); setLanguage('pt'); }}>
                            <Image src="/images/pt.svg" alt="Português" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
                        </a>
                        <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); setLanguage('en'); }}>
                            <Image src="/images/en.svg" alt="English" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
                        </a>
                        <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); setLanguage('it'); }}>
                            <Image src="/images/it.svg" alt="Italiano" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
                        </a>
                        <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); setLanguage('es'); }}>
                            <Image src="/images/es.svg" alt="Español" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
                        </a>
                        <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); setLanguage('fr'); }}>
                            <Image src="/images/fr.svg" alt="Français" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
                        </a>
                        <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); setLanguage('de'); }}>
                            <Image src="/images/de.svg" alt="Deutsch" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
                        </a>
                        <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); setLanguage('nl'); }}>
                            <Image src="/images/nl.svg" alt="Nederlands" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
                        </a>
                    </div>

                    <p className="mt-2 text-left text-[10px] md:text-[13px] text-gray-400">
                        {t('Forgot your password? No problem. Just let us know your email address and we will email you a password reset link that will allow you to choose a new one.')}
                    </p>

                    {message && (
                        <div className="mt-4 bg-green-900/50 border border-green-800 text-green-200 px-4 py-3 rounded relative" role="alert">
                            <span className="block sm:inline">{message}</span>
                        </div>
                    )}

                    {error && (
                        <div className="mt-4 bg-red-900/50 border border-red-800 text-red-200 px-4 py-3 rounded relative" role="alert">
                            <span className="block sm:inline">{error}</span>
                        </div>
                    )}

                    <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                                {t('Email address')}
                            </label>
                            <div className="mt-1">
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    required
                                    className="block w-full rounded-md shadow-sm bg-gray-700 border-gray-600 text-gray-300 focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                    placeholder={t('Email address')}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <Link
                                href="/login"
                                className="text-gray-400 hover:text-gray-100"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            </Link>

                            <button
                                type="submit"
                                disabled={loading}
                                className="inline-flex items-center px-4 py-2 bg-gray-700 border border-transparent rounded-md font-semibold text-xs text-white uppercase tracking-widest hover:bg-gray-600 active:bg-gray-900 focus:outline-none focus:border-gray-900 focus:ring ring-gray-300 disabled:opacity-25 transition ease-in-out duration-150"
                            >
                                {loading ? t('Sending...') : t('Send Reset Link')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <footer className="absolute w-full bottom-0">
                <div className="footer-container flex justify-center space-x-4 text-[11px] md:text-[13px] text-gray-500">
                    <a href="https://login.jamestradinggroup.com/terms-and-conditions" className="hover:text-gray-400 no-margin" target="_blank" rel="noopener noreferrer">
                        {t('Terms and Conditions')}
                    </a>
                    <a href="https://login.jamestradinggroup.com/privacy-policy" className="hover:text-gray-400 no-margin" target="_blank" rel="noopener noreferrer">
                        {t('Privacy Policy')}
                    </a>
                    <a href="https://login.jamestradinggroup.com/earnings-disclaimer" className="hover:text-gray-400 no-margin" target="_blank" rel="noopener noreferrer">
                        {t('Earnings Disclaimer')}
                    </a>
                </div>
            </footer>
        </div>
    );
}
