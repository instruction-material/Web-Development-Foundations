import mongoose from "mongoose";


const noteSchema = new mongoose.Schema(
	{
		title: {
			type: String,
			required: true,
			trim: true,
			maxlength: 120,
		},
		body: {
			type: String,
			required: true,
			trim: true,
			maxlength: 2000,
		},
		tags: {
			type: [String],
			default: [],
		},
	},
	{timestamps: true},
);

noteSchema.index({title: 1});

export const Note = mongoose.model("Note", noteSchema);

