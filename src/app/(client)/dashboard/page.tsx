"use client";

import Modal from "@/components/dashboard/Modal";
import CreateInterviewCard from "@/components/dashboard/interview/createInterviewCard";
import InterviewCard from "@/components/dashboard/interview/interviewCard";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { useInterviews } from "@/contexts/interviews.context";
import { ClientService } from "@/services/clients.service";
import { InterviewService } from "@/services/interviews.service";
import { ResponseService } from "@/services/responses.service";

import { Gem, Plus } from "lucide-react";
import Image from "next/image";
import React, { useState, useEffect } from "react";

function Interviews() {
  const { interviews, interviewsLoading } = useInterviews();
  const organization = { id: "default-org" };
  const [loading, setLoading] = useState<boolean>(false);
  const [currentPlan, setCurrentPlan] = useState<string>("");
  const [allowedResponsesCount, setAllowedResponsesCount] = useState<number>(10);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  function InterviewsLoader() {
    return (
      <>
        <div className="flex flex-row">
          <div className="h-60 w-56 ml-1 mr-3 mt-3 flex-none animate-pulse rounded-xl bg-gray-300" />
          <div className="h-60 w-56 ml-1 mr-3  mt-3 flex-none animate-pulse rounded-xl bg-gray-300" />
          <div className="h-60 w-56 ml-1 mr-3 mt-3 flex-none animate-pulse rounded-xl bg-gray-300" />
        </div>
      </>
    );
  }

  useEffect(() => {
    const fetchOrganizationData = async () => {
      try {
        if (organization?.id) {
          const data = await ClientService.getOrganizationById(organization.id);
          if (data?.plan) {
            setCurrentPlan(data.plan);
            if (data.plan === "free_trial_over") {
              setIsModalOpen(true);
            }
          }
          if (data?.allowed_responses_count) {
            setAllowedResponsesCount(data.allowed_responses_count);
          }
        }
      } catch (error) {
        console.error("Error fetching organization data:", error);
      }
    };

    fetchOrganizationData();
  }, []);

  useEffect(() => {
    const fetchResponsesCount = async () => {
      if (!organization || currentPlan !== "free") {
        return;
      }

      setLoading(true);
      try {
        const totalResponses = await ResponseService.getResponseCountByOrganizationId(
          organization.id,
        );
        const hasExceededLimit = totalResponses >= allowedResponsesCount;
        if (hasExceededLimit) {
          setCurrentPlan("free_trial_over");
          await InterviewService.deactivateInterviewsByOrgId(organization.id);
          await ClientService.updateOrganization({ plan: "free_trial_over" }, organization.id);
        }
      } catch (error) {
        console.error("Error fetching responses:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchResponsesCount();
  }, [currentPlan, allowedResponsesCount]);

  return (
    <main className="p-8 pt-0 ml-12 mr-auto rounded-md">
      <div className="flex flex-col items-left">
        <h2 className="mr-2 text-2xl font-semibold tracking-tight mt-8">My Interviews</h2>
        <h3 className=" text-sm tracking-tight text-gray-600 font-medium ">
          Start getting responses now!
        </h3>
      </div>

      <div className="flex flex-col lg:flex-row mt-6 gap-8 items-start">
        <div className="flex-1">
          <div className="relative flex items-start flex-wrap">
            {currentPlan === "free_trial_over" ? (
              <Card className=" flex bg-gray-200 items-center border-dashed border-gray-700 border-2 hover:scale-105 ease-in-out duration-300 h-60 w-56 ml-1 mr-3 mt-4 rounded-xl shrink-0 overflow-hidden shadow-md">
                <CardContent className="flex items-center flex-col mx-auto">
                  <div className="flex flex-col justify-center items-center w-full overflow-hidden">
                    <Plus size={90} strokeWidth={0.5} className="text-gray-700" />
                  </div>
                  <CardTitle className="p-0 text-md text-center">
                    You cannot create any more interviews unless you upgrade
                  </CardTitle>
                </CardContent>
              </Card>
            ) : (
              <CreateInterviewCard />
            )}
            {interviewsLoading || loading ? (
              <InterviewsLoader />
            ) : (
              <>
                {isModalOpen && (
                  <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)}>
                    <div className="flex flex-col space-y-4">
                      <div className="flex justify-center text-indigo-600">
                        <Gem />
                      </div>
                      <h3 className="text-xl font-semibold text-center">Upgrade to Pro</h3>
                      <p className="text-l text-center">
                        You have reached your limit for the free trial. Please upgrade to pro to
                        continue using our features.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex justify-center items-center">
                          <Image
                            src={"/premium-plan-icon.png"}
                            alt="Graphic"
                            width={299}
                            height={300}
                          />
                        </div>

                        <div className="grid grid-rows-2 gap-2">
                          <div className="p-4 border rounded-lg">
                            <h4 className="text-lg font-medium">Free Plan</h4>
                            <ul className="list-disc pl-5 mt-2">
                              <li>10 Responses</li>
                              <li>Basic Support</li>
                              <li>Limited Features</li>
                            </ul>
                          </div>
                          <div className="p-4 border rounded-lg">
                            <h4 className="text-lg font-medium">Pro Plan</h4>
                            <ul className="list-disc pl-5 mt-2">
                              <li>Flexible Pay-Per-Response</li>
                              <li>Priority Support</li>
                              <li>All Features</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                      <p className="text-l text-center">
                        Contact <span className="font-semibold">founders@E-nest.co</span> to upgrade
                        your plan.
                      </p>
                    </div>
                  </Modal>
                )}
                {interviews.map((item) => (
                  <InterviewCard
                    id={item.id}
                    interviewerId={item.interviewer_id}
                    key={item.id}
                    name={item.name}
                    url={item.url ?? ""}
                    readableSlug={item.readable_slug}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        {/* Right Area (Instructions) */}
        <div className="w-full lg:w-[350px] xl:w-[400px] shrink-0 p-6 bg-indigo-50 border border-indigo-100 rounded-xl shadow-sm text-indigo-950">
          <h4 className="text-lg font-semibold flex items-center mb-5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 mr-2 text-indigo-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <title>Information icon</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Quick Guide
          </h4>

          <div className="space-y-6 text-sm">
            <div>
              <h5 className="font-semibold text-indigo-800">1. Create an Interview</h5>
              <p className="mt-1 text-gray-600">
                Click the "Create an Interview" card to start. Set your objectives, target audience,
                and add required questions for the AI agent to ask.
              </p>
            </div>

            <div>
              <h5 className="font-semibold text-indigo-800">2. Customize the Interviewer</h5>
              <p className="mt-1 text-gray-600">
                Go to the "Interviewers" tab on the left sidebar. There, you can customize the
                voice, personality (empathy, rapport, exploration), and avatar of your AI agent.
              </p>
            </div>

            <div>
              <h5 className="font-semibold text-indigo-800">3. Share the Link</h5>
              <p className="mt-1 text-gray-600">
                Once your interview is created, click the link icon on your interview card to copy
                the unique URL. Share this with your respondents so they can take the interview.
              </p>
            </div>

            <div>
              <h5 className="font-semibold text-indigo-800">4. Analyze Responses</h5>
              <p className="mt-1 text-gray-600">
                As participants complete the interview, their transcripts and extracted insights
                will appear in your dashboard for review.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default Interviews;
