"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/utils/translation";
import { toast } from "react-hot-toast";

export default function ResetPassword({ params }: { params: { token: string } }) {
  const { translations, setLanguage } = useLanguage();
  const t = (key: string) => getTranslation(translations, key);
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const email = searchParams.get("email");
  const token = params.token;

  useEffect(() => {
    if (!email) {
      setError(t("passwords.invalid_reset_link"));
    }
  }, [email, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (password !== passwordConfirmation) {
      setError(t("passwords.mismatch"));
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
            email,
            password,
            password_confirmation: passwordConfirmation,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        toast.success(t("passwords.reset"));
        setPassword("");
        setPasswordConfirmation("");
      } else {
        setError(t(data.message) || t("passwords.reset_error"));
      }
    } catch (err) {
      setError(t("passwords.reset_error"));
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

          {error && (
            <div className="mb-4 bg-red-900/50 border border-red-800 text-red-200 px-4 py-3 rounded relative" role="alert">
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 bg-green-900/50 border border-green-800 text-green-200 px-4 py-3 rounded relative" role="alert">
              <span className="block sm:inline">{t("passwords.reset_success")}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                {t("Password")}
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block mt-1 w-full rounded-md shadow-sm bg-gray-700 border-gray-600 text-gray-300 focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                />
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="password_confirmation" className="block text-sm font-medium text-gray-300">
                {t("Confirm Password")}
              </label>
              <div className="mt-1">
                <input
                  id="password_confirmation"
                  name="password_confirmation"
                  type="password"
                  required
                  value={passwordConfirmation}
                  onChange={(e) => setPasswordConfirmation(e.target.value)}
                  className="block mt-1 w-full rounded-md shadow-sm bg-gray-700 border-gray-600 text-gray-300 focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-4">
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
                className="ml-3 inline-flex items-center px-4 py-2 bg-gray-700 border border-transparent rounded-md font-semibold text-xs text-white uppercase tracking-widest hover:bg-gray-600 active:bg-gray-900 focus:outline-none focus:border-gray-900 focus:ring ring-gray-300 disabled:opacity-25 transition ease-in-out duration-150"
              >
                {loading ? t("Loading") : t("Reset Password")}
              </button>
            </div>
          </form>
        </div>
      </div>

      <footer className="absolute w-full bottom-0">
        <div className="footer-container flex justify-center space-x-4 text-[11px] md:text-[13px] text-gray-500">
          <a href="https://login.jamestradinggroup.com/terms-and-conditions" className="hover:text-gray-400 no-margin" target="_blank" rel="noopener noreferrer">
            {t("Terms and Conditions")}
          </a>
          <a href="https://login.jamestradinggroup.com/privacy-policy" className="hover:text-gray-400 no-margin" target="_blank" rel="noopener noreferrer">
            {t("Privacy Policy")}
          </a>
          <a href="https://login.jamestradinggroup.com/earnings-disclaimer" className="hover:text-gray-400 no-margin" target="_blank" rel="noopener noreferrer">
            {t("Earnings Disclaimer")}
          </a>
        </div>
      </footer>
    </div>
  );
}
