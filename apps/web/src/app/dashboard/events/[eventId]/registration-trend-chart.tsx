"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type TrendPoint = {
  date: string;
  registrations: number;
};

export function RegistrationTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="vf-chart" aria-label="Registration count trend">
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 12, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Area type="monotone" dataKey="registrations" stroke="#3279f6" fill="#d8e7ff" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

